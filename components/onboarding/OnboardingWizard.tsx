"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StepInfo } from "./steps/StepInfo";
import { StepMenu } from "./steps/StepMenu";
import { StepTables } from "./steps/StepTables";
import { StepDone } from "./steps/StepDone";
import type { OnboardingState } from "@/app/r/[slug]/admin/(protected)/onboarding/actions";

const STEPS = ["Thông tin", "Menu mẫu", "Bàn + QR", "Xong"];

/**
 * Wizard 4 bước điều phối các action P2 (menu/bàn/thông tin). Điều hướng tiến/lùi
 * bằng state cục bộ; các nút seed redirect về ?step=N nên bước hiện tại giữ đúng.
 */
export function OnboardingWizard({
  slug,
  initialStep,
  state,
  tenantName,
  logoUrl,
}: {
  slug: string;
  initialStep: number;
  state: OnboardingState;
  tenantName: string;
  logoUrl: string | null;
}) {
  const [step, setStep] = useState(Math.min(4, Math.max(1, initialStep)));

  return (
    <div>
      {/* Tiến trình */}
      <ol className="flex items-center gap-xs">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const doneStep =
            (n === 1 && (state.hasLogo || tenantName)) ||
            (n === 2 && state.hasMenu) ||
            (n === 3 && state.hasTables) ||
            (n === 4 && state.done);
          return (
            <li key={label} className="flex flex-1 items-center gap-xs">
              <button
                type="button"
                onClick={() => setStep(n)}
                className={`flex items-center gap-xs rounded-md px-sm py-xs text-sm transition-colors ${
                  active
                    ? "bg-cream font-medium text-ink"
                    : "text-steel hover:bg-surface"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                    doneStep
                      ? "bg-status-ready text-status-ready-fg"
                      : active
                        ? "bg-primary text-primary-fg"
                        : "bg-surface text-steel"
                  }`}
                >
                  {doneStep ? "✓" : n}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-hairline-soft" />}
            </li>
          );
        })}
      </ol>

      {/* Nội dung bước */}
      <div className="mt-xl rounded-lg border border-hairline-soft bg-canvas p-xl">
        <h2 className="font-display text-xl text-ink">
          Bước {step}: {STEPS[step - 1]}
        </h2>
        <div className="mt-lg">
          {step === 1 && <StepInfo slug={slug} name={tenantName} logoUrl={logoUrl} />}
          {step === 2 && (
            <StepMenu slug={slug} hasMenu={state.hasMenu} itemCount={state.itemCount} />
          )}
          {step === 3 && <StepTables slug={slug} tableCount={state.tableCount} />}
          {step === 4 && (
            <StepDone slug={slug} itemCount={state.itemCount} tableCount={state.tableCount} />
          )}
        </div>

        {/* Điều hướng */}
        <div className="mt-xl flex items-center justify-between border-t border-hairline-soft pt-lg">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            ← Quay lại
          </Button>
          {step < 4 ? (
            <Button type="button" variant="primary" size="sm" onClick={() => setStep((s) => s + 1)}>
              {step === 1 || step === 2 || step === 3 ? "Tiếp (có thể bỏ qua)" : "Tiếp"} →
            </Button>
          ) : (
            <span className="text-xs text-steel">Bấm &quot;Hoàn tất&quot; ở trên để kết thúc.</span>
          )}
        </div>
      </div>
    </div>
  );
}
