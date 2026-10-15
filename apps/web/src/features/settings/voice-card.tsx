import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, StopIcon } from "@hugeicons/core-free-icons"
import {
  isEnglishKokoroVoice,
  KOKORO_VOICES,
  kokoroVoiceKind,
  kokoroVoiceName,
  OPENAI_VOICES,
  type OpenAiVoice,
  type PreviewVoiceInput,
  type VoiceProvider,
  type VoiceSettings,
} from "@mise/shared"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import {
  previewVoice,
  useSaveVoiceSettings,
  useVoiceSettings,
} from "./use-voice"

const CHOICES: { id: VoiceProvider; label: string }[] = [
  { id: "device", label: "This device's" },
  { id: "kokoro", label: "Kokoro" },
  { id: "openai", label: "OpenAI" },
]

/** Server admin: how hands-free cook mode reads steps aloud. */
export function VoiceCard() {
  const settings = useVoiceSettings()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice</CardTitle>
        <CardDescription>
          How hands-free cook mode reads steps aloud. Kokoro sounds close to a
          person and runs beside Mise for free; OpenAI sounds much the same and
          costs about 2 to 5¢ to read a recipe once. Either way each step is
          made once and saved, so cooking a recipe again is instant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isPending ? (
          <Skeleton className="h-40" />
        ) : settings.isError ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load the voice settings.
          </p>
        ) : (
          <VoiceForm saved={settings.data} />
        )}
      </CardContent>
    </Card>
  )
}

function VoiceForm({ saved }: { saved: VoiceSettings }) {
  const save = useSaveVoiceSettings()
  const [provider, setProvider] = React.useState(saved.provider)
  const [url, setUrl] = React.useState(saved.kokoro.url ?? "")
  const [kokoroVoice, setKokoroVoice] = React.useState(saved.kokoro.voice)
  const [openaiVoice, setOpenaiVoice] = React.useState<OpenAiVoice>(
    saved.openai.voice
  )
  const [allLanguages, setAllLanguages] = React.useState(false)

  const urlChanged = url.trim() !== (saved.kokoro.url ?? "")
  const dirty =
    provider !== saved.provider ||
    urlChanged ||
    kokoroVoice !== saved.kokoro.voice ||
    openaiVoice !== saved.openai.voice
  // Kokoro's own list, the friendliest first and English ones unless asked;
  // the known few when it can't be reached.
  const kokoroAll = saved.kokoro.voices.length
    ? [
        ...KOKORO_VOICES.map((v) => v.id).filter((id) =>
          saved.kokoro.voices.includes(id)
        ),
        ...saved.kokoro.voices.filter(
          (id) => !KOKORO_VOICES.some((v) => v.id === id)
        ),
      ]
    : KOKORO_VOICES.map((v) => v.id)
  const otherLanguages = kokoroAll.filter((id) => !isEnglishKokoroVoice(id))
  const kokoroOptions = kokoroAll
    .filter(
      (id) => allLanguages || isEnglishKokoroVoice(id) || id === kokoroVoice
    )
    .map((id) => ({
      id,
      name: kokoroVoiceName(id),
      detail: kokoroVoiceKind(id),
    }))

  async function submit() {
    return save.mutateAsync({
      provider,
      ...(urlChanged ? { kokoroUrl: url.trim() || null } : {}),
      kokoroVoice,
      openaiVoice,
    })
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault()
    try {
      await submit()
      toast.success("Voice saved")
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't save that"
      )
    }
  }

  return (
    <form onSubmit={onSave}>
      <FieldGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          value={provider}
          onValueChange={(value) =>
            value && setProvider(value as VoiceProvider)
          }
          className="w-full"
          aria-label="Voice"
        >
          {CHOICES.map((choice) => (
            <ToggleGroupItem
              key={choice.id}
              value={choice.id}
              className="flex-1"
            >
              {choice.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {provider === "device" && (
          <p className="text-sm text-muted-foreground">
            Each phone or computer reads with its own best voice, chosen in cook
            mode. Free, but it varies: Edge and Apple devices sound good, Chrome
            and Firefox on Windows sound robotic.
          </p>
        )}

        {provider === "kokoro" && (
          <>
            <Field>
              <FieldLabel htmlFor="kokoro-url">Kokoro's address</FieldLabel>
              <Input
                id="kokoro-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="http://kokoro:8880"
                inputMode="url"
                maxLength={300}
              />
              <FieldDescription>
                {saved.kokoro.error
                  ? saved.kokoro.error
                  : saved.kokoro.voices.length
                    ? `Connected: ${saved.kokoro.voices.length} voices.`
                    : saved.kokoro.fromEnv
                      ? "From the compose file."
                      : "Where its container answers. The compose file's is http://kokoro:8880."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Voice</FieldLabel>
              <VoiceList
                options={kokoroOptions}
                value={kokoroVoice}
                onChange={setKokoroVoice}
                preview={(voice) => ({
                  provider: "kokoro",
                  voice,
                  ...(url.trim() && urlChanged
                    ? { kokoroUrl: url.trim() }
                    : {}),
                })}
              />
              {otherLanguages.length > 0 && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto justify-self-start px-0"
                  onClick={() => setAllLanguages((value) => !value)}
                >
                  {allLanguages
                    ? "Just the English voices"
                    : `Voices in other languages (${otherLanguages.length})`}
                </Button>
              )}
            </Field>
          </>
        )}

        {provider === "openai" && (
          <Field>
            <FieldLabel>Voice</FieldLabel>
            <VoiceList
              options={OPENAI_VOICES.map((voice) => ({
                id: voice,
                name: voice[0]!.toUpperCase() + voice.slice(1),
                detail: null,
              }))}
              value={openaiVoice}
              onChange={(voice) => setOpenaiVoice(voice as OpenAiVoice)}
              preview={(voice) => ({
                provider: "openai",
                voice: voice as OpenAiVoice,
              })}
            />
            <FieldDescription>
              {saved.openai.available
                ? "Uses the OpenAI key from AI, told to sound like a warm, unhurried cooking teacher. Each preview costs a fraction of a cent the first time."
                : "Needs an OpenAI key: add one under AI first."}
            </FieldDescription>
          </Field>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

type VoiceOption = { id: string; name: string; detail: string | null }

/**
 * Voices to pick from, each with a play button that reads a sample step in
 * it, so it can be heard before it's picked.
 */
function VoiceList({
  options,
  value,
  onChange,
  preview,
}: {
  options: VoiceOption[]
  value: string
  onChange: (id: string) => void
  preview: (id: string) => PreviewVoiceInput
}) {
  const [playing, setPlaying] = React.useState<{
    id: string
    loading: boolean
  } | null>(null)
  const audio = React.useRef<HTMLAudioElement | null>(null)
  React.useEffect(() => () => audio.current?.pause(), [])

  async function play(id: string) {
    audio.current?.pause()
    if (playing?.id === id) {
      setPlaying(null)
      return
    }
    setPlaying({ id, loading: true })
    try {
      const url = await previewVoice(preview(id))
      const sound = new Audio(url)
      audio.current = sound
      sound.onended = () =>
        setPlaying((current) => (current?.id === id ? null : current))
      await sound.play()
      setPlaying((current) =>
        current?.id === id ? { id, loading: false } : current
      )
    } catch (error) {
      setPlaying((current) => (current?.id === id ? null : current))
      toast.error(
        error instanceof Error ? error.message : "Couldn't play that voice"
      )
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Voice"
      className="grid gap-1.5 sm:grid-cols-2"
    >
      {options.map((option) => {
        const picked = option.id === value
        const here = playing?.id === option.id
        return (
          <div
            key={option.id}
            className={cn(
              "flex items-center gap-1 rounded-2xl border py-1 pr-1 pl-3 transition-colors",
              picked && "border-primary bg-primary/5"
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={picked}
              onClick={() => onChange(option.id)}
              className="grid min-w-0 flex-1 rounded-lg py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="truncate text-sm font-medium">
                {option.name}
              </span>
              {option.detail && (
                <span className="text-xs text-muted-foreground">
                  {option.detail}
                </span>
              )}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-full"
              aria-label={
                here && !playing?.loading
                  ? `Stop ${option.name}`
                  : `Hear ${option.name}`
              }
              onClick={() => play(option.id)}
            >
              {here && playing?.loading ? (
                <Spinner />
              ) : (
                <HugeiconsIcon
                  icon={here ? StopIcon : PlayIcon}
                  strokeWidth={2}
                />
              )}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
