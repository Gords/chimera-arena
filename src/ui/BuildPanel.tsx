// ============================================================
// Chimera Arena - Build Panel (60-second build phase)
// Players type chimera body-part descriptions.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import type { BuildSlot, BuildParts } from '../types';

const BUILD_DURATION = 60; // seconds

const SLOTS: { key: BuildSlot; label: string; placeholder: string }[] = [
  { key: 'head', label: 'HEAD', placeholder: 'e.g. "dragon skull with glowing eyes"' },
  { key: 'torso', label: 'TORSO', placeholder: 'e.g. "crystal armor plating"' },
  { key: 'arms', label: 'ARMS', placeholder: 'e.g. "shadow tendrils"' },
  { key: 'legs', label: 'LEGS', placeholder: 'e.g. "spider legs"' },
  { key: 'wild', label: 'WILD CARD', placeholder: 'e.g. "cursed crown"' },
];

export default function BuildPanel() {
  const { room, myTeam, submitPart, generating } = useGame();
  const [timer, setTimer] = useState(BUILD_DURATION);
  const [localParts, setLocalParts] = useState<Partial<BuildParts>>({});
  const [submitted, setSubmitted] = useState(false);

  // ---- Timer countdown ----

  useEffect(() => {
    if (submitted) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [submitted]);

  // ---- Auto-submit on timer expiry ----

  useEffect(() => {
    if (timer === 0 && !submitted) {
      handleSubmit();
    }
  }, [timer, submitted]);

  // ---- Derived state ----

  const teamParts = useMemo(() => {
    if (!room || !myTeam) return {};
    return room.buildParts[myTeam];
  }, [room, myTeam]);

  const filledCount = useMemo(() => {
    return SLOTS.filter(
      (s) => (localParts[s.key] && localParts[s.key]!.trim()) || teamParts[s.key]
    ).length;
  }, [localParts, teamParts]);

  const allFilled = filledCount === 5;

  // ---- Handlers ----

  const handlePartChange = useCallback(
    (slot: BuildSlot, value: string) => {
      setLocalParts((prev) => ({ ...prev, [slot]: value }));
    },
    []
  );

  const handlePartBlur = useCallback(
    (slot: BuildSlot) => {
      const value = localParts[slot];
      if (value && value.trim()) {
        submitPart(slot, value.trim());
      }
    },
    [localParts, submitPart]
  );

  const handleSubmit = useCallback(() => {
    // Submit any local parts that haven't been sent yet
    SLOTS.forEach((s) => {
      const value = localParts[s.key];
      if (value && value.trim()) {
        submitPart(s.key, value.trim());
      }
    });
    setSubmitted(true);
  }, [localParts, submitPart]);

  // ---- Generating overlay ----

  if (generating) {
    return (
      <div className="screen-container">
        <div className="reveal-generating">
          AI IS FORGING YOUR CHIMERA...
          <br />
          <span style={{ fontSize: 8, color: 'var(--text-secondary)' }}>
            Combining your team's creations
          </span>
        </div>
      </div>
    );
  }

  // ---- Render ----

  return (
    <div className="screen-container">
      <div className="build-container animate-fade-in">
        <h2 className="screen-title">BUILD YOUR CHIMERA</h2>

        {/* Timer */}
        <div
          className={`build-timer ${timer <= 10 ? 'build-timer-urgent' : ''}`}
        >
          {timer}s
        </div>

        {/* Progress */}
        <div className="build-team-progress">
          <span>PARTS FILLED:</span>
          {SLOTS.map((s) => {
            const isFilled =
              (localParts[s.key] && localParts[s.key]!.trim()) ||
              teamParts[s.key];
            return (
              <span
                key={s.key}
                className={`build-progress-dot ${
                  isFilled ? 'build-progress-dot-filled' : ''
                }`}
                title={s.label}
              />
            );
          })}
        </div>

        {/* Slots */}
        <div className="build-slots">
          {SLOTS.map((s) => {
            const serverValue = teamParts[s.key];
            const localValue = localParts[s.key] ?? '';
            const displayValue = localValue || serverValue || '';
            const isFilled = Boolean(displayValue.trim());
            const isWild = s.key === 'wild';

            return (
              <div
                key={s.key}
                className={`build-slot ${isWild ? 'build-slot-wide' : ''}`}
              >
                <label className="build-slot-label">{s.label}</label>
                <input
                  className={`pixel-input ${
                    isFilled ? 'build-slot-filled' : ''
                  }`}
                  type="text"
                  placeholder={s.placeholder}
                  value={displayValue}
                  onChange={(e) => handlePartChange(s.key, e.target.value)}
                  onBlur={() => handlePartBlur(s.key)}
                  disabled={submitted}
                  maxLength={80}
                />
              </div>
            );
          })}
        </div>

        {/* Submit */}
        <button
          className="btn btn-primary"
          disabled={submitted || !allFilled}
          onClick={handleSubmit}
        >
          {submitted ? 'SUBMITTED!' : 'SUBMIT CHIMERA PARTS'}
        </button>

        {submitted && (
          <p
            style={{
              fontSize: 8,
              color: 'var(--text-secondary)',
              textAlign: 'center',
            }}
          >
            Waiting for build phase to end...
          </p>
        )}
      </div>
    </div>
  );
}
