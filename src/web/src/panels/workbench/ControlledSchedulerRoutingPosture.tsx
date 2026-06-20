import type { ReactElement } from "react";
import { userFacingText } from "../../formatters.js";
import type { ControlledSchedulerRoutingPostureDetail } from "../../types.js";

export function ControlledSchedulerRoutingPosture({
  posture,
  compact = false,
}: {
  posture: ControlledSchedulerRoutingPostureDetail;
  compact?: boolean;
}): ReactElement {
  return (
    <div className="decision-routing-posture" aria-label="Controlled scheduler routing posture">
      <strong>{userFacingText(posture.label)}</strong>
      <p>{userFacingText(posture.body)}</p>
      <p className="muted-inline">{userFacingText(posture.boundary)}</p>
      {!compact && posture.reasons.length ? (
        <ul>
          {posture.reasons.map((reason) => (
            <li key={reason}>{userFacingText(reason)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
