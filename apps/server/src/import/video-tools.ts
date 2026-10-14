import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { config } from "../config.ts"
import { HttpError } from "../http.ts"

export type VideoCaptions = { url: string; lang: string }

export type VideoInfo = {
  url: string
  title: string | null
  description: string | null
  uploader: string | null
  /** Seconds, when the site says. */
  duration: number | null
  thumbnail: string | null
  captions: VideoCaptions | null
}

/** What video import needs from yt-dlp and ffmpeg. Tests swap in a fake. */
export type VideoTools = {
  /** Reads the video's details without downloading it. */
  probe(url: string): Promise<VideoInfo>
  /** Downloads a small copy (480p or less, or just the audio) into `dir`. */
  download(
    url: string,
    dir: string,
    options: { audioOnly: boolean }
  ): Promise<string>
  /** Mono 32 kbps MP3, small enough to transcribe. */
  extractAudio(file: string, dir: string): Promise<Buffer>
  /** `count` JPEG frames spread across the video. */
  frames(
    file: string,
    dir: string,
    count: number,
    duration: number | null
  ): Promise<Buffer[]>
}

const ytDlp = () => process.env.YTDLP_PATH || "yt-dlp"
const ffmpeg = () => process.env.FFMPEG_PATH || "ffmpeg"

function run(command: string, args: string[], timeout: number) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr: String(stderr) }))
        } else {
          resolve(String(stdout))
        }
      }
    )
  })
}

/** Turns a yt-dlp failure into something worth showing. */
export function ytDlpError(error: unknown): HttpError {
  const {
    code,
    stderr = "",
    killed,
  } = error as {
    code?: string | number
    stderr?: string
    killed?: boolean
  }
  if (code === "ENOENT") {
    return new HttpError(
      501,
      "Video import needs yt-dlp and ffmpeg. They come with the Docker image; for local development, install both."
    )
  }
  if (killed) return new HttpError(504, "That video took too long to read")
  const message = stderr.split("\n").find((line) => line.startsWith("ERROR:"))
  // Instagram's "login required", YouTube's "Sign in to confirm you're not a bot".
  if (
    /login required|rate-limit|sign in to confirm|use --cookies/i.test(stderr)
  ) {
    return new HttpError(
      422,
      "That site wants a signed-in session for this video. An admin can add a cookies.txt file (see the README)."
    )
  }
  if (
    /private|unavailable|removed|not available|does not exist/i.test(stderr)
  ) {
    return new HttpError(
      422,
      "That video isn't available. It may be private or deleted."
    )
  }
  if (/unsupported url/i.test(stderr)) {
    return new HttpError(422, "That doesn't look like a link to a video")
  }
  console.error("yt-dlp failed:", message ?? stderr.slice(-500))
  return new HttpError(502, "Couldn't read that video")
}

function commonArgs() {
  const args = [
    "--ignore-config",
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--socket-timeout",
    "20",
    // YouTube needs a JavaScript runtime now; Node is already here.
    "--js-runtimes",
    "node",
  ]
  // For sites that want a signed-in session (often Instagram): a cookies.txt
  // exported from a browser, in the data folder unless set elsewhere.
  const cookies =
    process.env.YTDLP_COOKIES_FILE || join(config.dataDir, "cookies.txt")
  if (existsSync(cookies)) args.push("--cookies", cookies)
  return args
}

type Track = { ext?: string; url?: string }

/** Captions in English (or the video's own language): written ones first, then automatic. */
export function pickCaptions(raw: {
  language?: string | null
  subtitles?: Record<string, Track[]> | null
  automatic_captions?: Record<string, Track[]> | null
}): VideoCaptions | null {
  const own = raw.language ?? undefined
  const wanted = (lang: string) =>
    /^en/i.test(lang) || (own !== undefined && lang.startsWith(own))
  const sources: [Record<string, Track[]>, (lang: string) => boolean][] = [
    [raw.subtitles ?? {}, wanted],
    // Automatic captions are offered in many machine-translated languages;
    // "-orig" is what was actually said.
    [raw.automatic_captions ?? {}, (lang) => lang.endsWith("-orig")],
    [raw.automatic_captions ?? {}, wanted],
  ]
  for (const [tracks, accept] of sources) {
    for (const [lang, formats] of Object.entries(tracks)) {
      if (!accept(lang) || lang === "live_chat") continue
      const vtt = formats.find((f) => f.ext === "vtt" && f.url)
      if (vtt?.url) return { url: vtt.url, lang }
    }
  }
  return null
}

/** WebVTT captions to plain text, without the repeats rolling captions have. */
export function captionsToText(vtt: string) {
  const lines: string[] = []
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim()
    if (
      !line ||
      line === "WEBVTT" ||
      /^(Kind|Language|NOTE|STYLE|REGION)\b/.test(line) ||
      /-->/.test(line) ||
      /^\d+$/.test(line)
    ) {
      continue
    }
    if (lines.at(-1) !== line) lines.push(line)
  }
  return lines.join("\n")
}

export const systemVideoTools: VideoTools = {
  async probe(url) {
    let output: string
    try {
      output = await run(
        ytDlp(),
        [...commonArgs(), "--dump-single-json", "--skip-download", "--", url],
        90_000
      )
    } catch (error) {
      throw ytDlpError(error)
    }
    const info = JSON.parse(output) as Record<string, unknown>
    const text = (key: string) =>
      typeof info[key] === "string" && info[key] ? (info[key] as string) : null
    return {
      url: text("webpage_url") ?? url,
      title: text("title") ?? text("fulltitle"),
      description: text("description"),
      uploader: text("uploader") ?? text("channel") ?? text("creator"),
      duration: typeof info.duration === "number" ? info.duration : null,
      thumbnail: text("thumbnail"),
      captions: pickCaptions(info as Parameters<typeof pickCaptions>[0]),
    }
  },

  async download(url, dir, { audioOnly }) {
    const format = audioOnly
      ? "ba/b[height<=360]/w"
      : "b[height<=480]/bv*[height<=480]+ba/w"
    let output: string
    try {
      output = await run(
        ytDlp(),
        [
          ...commonArgs(),
          "-f",
          format,
          "--merge-output-format",
          "mp4",
          "--max-filesize",
          "200M",
          "-o",
          join(dir, "video.%(ext)s"),
          "--no-simulate",
          "--print",
          "after_move:filepath",
          "--",
          url,
        ],
        240_000
      )
    } catch (error) {
      throw ytDlpError(error)
    }
    const file = output.trim().split("\n").at(-1)
    if (!file) throw new HttpError(502, "Couldn't download that video")
    return file
  },

  async extractAudio(file, dir) {
    const out = join(dir, "audio.mp3")
    try {
      await run(
        ffmpeg(),
        [
          "-v",
          "error",
          "-y",
          "-i",
          file,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-b:a",
          "32k",
          out,
        ],
        120_000
      )
    } catch (error) {
      console.error(
        "ffmpeg (audio) failed:",
        (error as { stderr?: string }).stderr
      )
      throw new HttpError(502, "Couldn't get the audio out of that video")
    }
    return readFile(out)
  },

  async frames(file, dir, count, duration) {
    // Spread the frames evenly; skip the first and last few percent, which
    // are usually a title card or an outro.
    const rate = duration && duration > 0 ? count / (duration * 0.9) : 0.25
    try {
      await run(
        ffmpeg(),
        [
          "-v",
          "error",
          "-y",
          ...(duration ? ["-ss", String(duration * 0.05)] : []),
          "-i",
          file,
          "-vf",
          `fps=${rate.toFixed(4)},scale='min(768,iw)':-2`,
          "-frames:v",
          String(count),
          "-q:v",
          "5",
          join(dir, "frame-%02d.jpg"),
        ],
        120_000
      )
    } catch (error) {
      console.error(
        "ffmpeg (frames) failed:",
        (error as { stderr?: string }).stderr
      )
      return []
    }
    const names = (await readdir(dir))
      .filter((n) => n.startsWith("frame-"))
      .sort()
    return Promise.all(names.map((name) => readFile(join(dir, name))))
  },
}

/**
 * Keeps yt-dlp current. Sites change often and yt-dlp follows within days,
 * so the Docker image lets the app update its own copy with yt-dlp's built-in
 * updater, on the nightly channel yt-dlp recommends. Runs at startup and
 * then weekly.
 */
export function scheduleYtDlpUpdates() {
  if (process.env.YTDLP_AUTO_UPDATE === "false") return
  const update = () =>
    run(ytDlp(), ["--ignore-config", "--update-to", "nightly"], 120_000)
      .then((out) => {
        const line = out.trim().split("\n").at(-1)
        if (line) console.log(`yt-dlp: ${line}`)
      })
      .catch((error: { code?: string; stderr?: string }) => {
        // Not installed (local development) or not writable: nothing to do.
        if (error.code !== "ENOENT") {
          console.warn(
            "yt-dlp update failed:",
            error.stderr?.trim().split("\n").at(-1)
          )
        }
      })
  setTimeout(update, 60_000).unref()
  setInterval(update, 7 * 24 * 60 * 60_000).unref()
}
