import type { ReputationScore } from "@/lib/analytics/types";
import { Delta, Meter } from "@/components/ui/stat";
import { NotEnoughData } from "@/components/ui/primitives";
import { MIN_REVIEWS_FOR_SCORE } from "@/lib/analytics/score";

/**
 * The reputation score, shown with the arithmetic that produced it.
 *
 * Every component displays the sentence explaining what it measured, because a
 * score an owner cannot take apart is a score they will not trust.
 */
export function ScoreBreakdown({
  score,
  delta,
  compact = false,
}: {
  score: ReputationScore;
  delta: number | null;
  compact?: boolean;
}) {
  if (score.score === null) {
    return (
      <div>
        <p className="text-3xl font-semibold tracking-[-0.02em] text-ink-muted">—</p>
        <p className="mt-2 text-sm text-ink-secondary">
          A score needs at least {MIN_REVIEWS_FOR_SCORE} reviews in the last 90
          days. There {score.reviewCount === 1 ? "is" : "are"}{" "}
          {score.reviewCount}.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="tnum text-4xl font-semibold tracking-[-0.03em] text-ink">
          {score.score}
        </span>
        <span className="text-sm text-ink-muted">/100</span>
      </div>

      <div className="mt-1.5">
        {delta === null ? (
          <NotEnoughData />
        ) : (
          <Delta
            value={delta}
            label="vs previous period"
            format={(v) => `${Math.abs(v)} point${Math.abs(v) === 1 ? "" : "s"}`}
          />
        )}
      </div>

      {!compact ? (
        <>
          <dl className="mt-5 space-y-3 border-t border-line pt-4">
            {score.components.map((component) => (
              <div key={component.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm text-ink">{component.label}</dt>
                  <dd className="tnum shrink-0 text-sm text-ink-secondary">
                    {component.earned.toFixed(1)}
                    <span className="text-ink-muted"> / {component.max}</span>
                  </dd>
                </div>
                <Meter
                  value={component.earned}
                  max={component.max}
                  className="mt-1.5"
                  tone={
                    component.earned / component.max >= 0.7
                      ? "accent"
                      : component.earned / component.max >= 0.4
                        ? "neutral"
                        : "critical"
                  }
                />
                <p className="mt-1 text-xs text-ink-muted">{component.detail}</p>
              </div>
            ))}
          </dl>

          {score.positiveDrivers.length > 0 || score.negativeDrivers.length > 0 ? (
            <div className="mt-5 space-y-1.5 border-t border-line pt-4">
              {score.positiveDrivers.map((driver) => (
                <p key={driver} className="text-sm text-ink-secondary">
                  <span aria-hidden className="mr-2 font-medium text-good">
                    +
                  </span>
                  {driver}
                </p>
              ))}
              {score.negativeDrivers.map((driver) => (
                <p key={driver} className="text-sm text-ink-secondary">
                  <span aria-hidden className="mr-2 font-medium text-critical">
                    −
                  </span>
                  {driver}
                </p>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
