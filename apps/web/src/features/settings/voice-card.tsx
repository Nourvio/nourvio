import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { VolumeHighIcon } from "@hugeicons/core-free-icons"
import {
  KOKORO_VOICES,
  kokoroVoiceName,
  OPENAI_VOICES,
  type OpenAiVoice,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"

import {
  playServerVoice,
  useSaveVoiceSettings,
  useVoiceSettings,
} from "./use-voice"

const SAMPLE =
  "Step 2. Pat the chicken dry, then season both sides with salt and pepper. Roast for 25 minutes, until golden."

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
  const [testing, setTesting] = React.useState(false)

  const urlChanged = url.trim() !== (saved.kokoro.url ?? "")
  const dirty =
    provider !== saved.provider ||
    urlChanged ||
    kokoroVoice !== saved.kokoro.voice ||
    openaiVoice !== saved.openai.voice
  // Kokoro's own list, with the friendliest ones first; the known few when it can't be reached.
  const kokoroOptions = saved.kokoro.voices.length
    ? [
        ...KOKORO_VOICES.map((v) => v.id).filter((id) =>
          saved.kokoro.voices.includes(id)
        ),
        ...saved.kokoro.voices.filter(
          (id) => !KOKORO_VOICES.some((v) => v.id === id)
        ),
      ]
    : KOKORO_VOICES.map((v) => v.id)

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

  async function test() {
    setTesting(true)
    try {
      if (dirty) await submit()
      await playServerVoice(SAMPLE)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't play the voice"
      )
    } finally {
      setTesting(false)
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
              <FieldLabel htmlFor="kokoro-voice">Voice</FieldLabel>
              <Select value={kokoroVoice} onValueChange={setKokoroVoice}>
                <SelectTrigger id="kokoro-voice" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kokoroOptions.map((id) => (
                    <SelectItem key={id} value={id}>
                      {kokoroVoiceName(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        {provider === "openai" && (
          <Field>
            <FieldLabel htmlFor="openai-voice">Voice</FieldLabel>
            <Select
              value={openaiVoice}
              onValueChange={(value) => setOpenaiVoice(value as OpenAiVoice)}
            >
              <SelectTrigger id="openai-voice" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_VOICES.map((voice) => (
                  <SelectItem key={voice} value={voice}>
                    {voice[0]!.toUpperCase() + voice.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {saved.openai.available
                ? "Uses the OpenAI key from AI. Told to sound like a warm, unhurried cooking teacher."
                : "Needs an OpenAI key: add one under AI first."}
            </FieldDescription>
          </Field>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
          {provider !== "device" && (
            <Button
              type="button"
              variant="outline"
              disabled={testing}
              onClick={test}
            >
              {testing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon
                  icon={VolumeHighIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
              )}
              {dirty ? "Save and test" : "Test"}
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  )
}
