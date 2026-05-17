import { describe, test, expect } from 'vitest';
import {
  INVOLVEMENT_PRESETS,
  detectPreset,
} from '../../../src/core/domain/involvement';

describe('INVOLVEMENT_PRESETS', () => {
  test('autopilot uses autonomous strictness + concise + no ask', () => {
    const p = INVOLVEMENT_PRESETS.autopilot;
    expect(p.strictness_mode).toBe('autonomous');
    expect(p.response_mode).toBe('concise');
    expect(p.ask_before_edit).toBe(false);
  });
  test('standard uses standard strictness + detailed + no ask', () => {
    const p = INVOLVEMENT_PRESETS.standard;
    expect(p.strictness_mode).toBe('standard');
    expect(p.response_mode).toBe('detailed');
    expect(p.ask_before_edit).toBe(false);
  });
  test('control uses careful strictness + detailed + no ask', () => {
    const p = INVOLVEMENT_PRESETS.control;
    expect(p.strictness_mode).toBe('careful');
    expect(p.response_mode).toBe('detailed');
    expect(p.ask_before_edit).toBe(false);
  });
  test('manual uses careful strictness + detailed + ask_before_edit', () => {
    const p = INVOLVEMENT_PRESETS.manual;
    expect(p.strictness_mode).toBe('careful');
    expect(p.response_mode).toBe('detailed');
    expect(p.ask_before_edit).toBe(true);
  });
});

describe('detectPreset', () => {
  test('detects autopilot', () => {
    expect(detectPreset({ strictness_mode: 'autonomous', response_mode: 'concise', ask_before_edit: false })).toBe('autopilot');
  });
  test('detects standard', () => {
    expect(detectPreset({ strictness_mode: 'standard', response_mode: 'detailed', ask_before_edit: false })).toBe('standard');
  });
  test('detects control', () => {
    expect(detectPreset({ strictness_mode: 'careful', response_mode: 'detailed', ask_before_edit: false })).toBe('control');
  });
  test('detects manual', () => {
    expect(detectPreset({ strictness_mode: 'careful', response_mode: 'detailed', ask_before_edit: true })).toBe('manual');
  });
  test('returns null for custom combination', () => {
    expect(detectPreset({ strictness_mode: 'verify_only', response_mode: 'concise', ask_before_edit: false })).toBeNull();
  });
  test('returns null when ask_before_edit differs from preset', () => {
    expect(detectPreset({ strictness_mode: 'autonomous', response_mode: 'concise', ask_before_edit: true })).toBeNull();
  });
  test('returns null for standard + ask_before_edit=true (custom state)', () => {
    expect(detectPreset({ strictness_mode: 'standard', response_mode: 'detailed', ask_before_edit: true })).toBeNull();
  });
});
