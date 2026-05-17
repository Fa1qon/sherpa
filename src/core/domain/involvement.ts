import type { StrictnessMode, ResponseMode } from './task';

export type InvolvementPreset = 'autopilot' | 'standard' | 'control' | 'manual';

export interface PresetSettings {
  readonly strictness_mode: StrictnessMode;
  readonly response_mode: ResponseMode;
  readonly ask_before_edit: boolean;
}

export const INVOLVEMENT_PRESETS: Readonly<Record<InvolvementPreset, PresetSettings>> = {
  autopilot: { strictness_mode: 'autonomous', response_mode: 'concise', ask_before_edit: false },
  standard:  { strictness_mode: 'standard',   response_mode: 'detailed', ask_before_edit: false },
  control:   { strictness_mode: 'careful',    response_mode: 'detailed', ask_before_edit: false },
  manual:    { strictness_mode: 'careful',    response_mode: 'detailed', ask_before_edit: true  },
};

export function detectPreset(s: PresetSettings): InvolvementPreset | null {
  const keys = Object.keys(INVOLVEMENT_PRESETS) as InvolvementPreset[];
  for (const key of keys) {
    const def = INVOLVEMENT_PRESETS[key];
    if (
      def.strictness_mode === s.strictness_mode &&
      def.response_mode   === s.response_mode   &&
      def.ask_before_edit === s.ask_before_edit
    ) {
      return key;
    }
  }
  return null;
}
