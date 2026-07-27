import { z } from "zod";

export const OFFICE_CALIBRATION_SCHEMA_VERSION = 4 as const;
export const OFFICE_CALIBRATION_LAYERS = ["shadow", "desk", "screen", "actor", "chair", "effect"] as const;
export const OFFICE_CALIBRATION_ACTION_IDS = [
  "working", "standby", "coffee-drink", "peek", "off-chair", "walk-horizontal", "walk-vertical",
  "leaving", "treadmill", "toilet", "standing-talk", "seated-talk", "salute",
] as const;
export const OFFICE_CALIBRATION_FACILITY_IDS = ["coffee", "treadmill", "toilet"] as const;

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const scaleSchema = z.object({ x: z.number().finite().positive(), y: z.number().finite().positive() }).strict();
const layerSchema = z.enum(OFFICE_CALIBRATION_LAYERS);
const positionedSlotSchema = z.object({
  localPosition: pointSchema,
  layer: layerSchema,
  visible: z.boolean(),
}).strict();
const staticComponentSchema = positionedSlotSchema.extend({
  componentId: z.string().min(1),
  resourceId: z.string().min(1),
  scale: scaleSchema,
  alpha: z.number().finite().min(0).max(1),
}).strict();
const screenSlotSchema = positionedSlotSchema.extend({
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
}).strict();
const labelSchema = positionedSlotSchema.extend({ scale: z.number().finite().positive() }).strict();
const actionVisualAlignmentSchema = z.object({
  scale: z.number().finite().positive(),
  offset: pointSchema,
}).strict();
const transitionDirectionSchema = z.object({
  fromFlipX: z.boolean(),
  toFlipX: z.boolean(),
  fromReverse: z.boolean(),
  toReverse: z.boolean(),
}).strict();
const stationSchema = z.object({
  stationId: z.string().min(1),
  label: z.string().min(1),
  preferredRoleId: z.string().min(1),
  stationTemplateId: z.string().min(1),
  origin: pointSchema,
  actorOffset: pointSchema,
  visible: z.boolean(),
}).strict();
const stationTemplateSchema = z.object({
  components: z.array(staticComponentSchema).min(1),
  screenSlot: screenSlotSchema,
  actorAnchor: positionedSlotSchema,
  label: labelSchema,
  anchors: z.record(z.string().min(1), pointSchema),
}).strict();
const effectSlotSchema = positionedSlotSchema.extend({
  resourceId: z.string().min(1),
  scale: scaleSchema,
}).strict();
const facilitySchema = z.object({
  origin: pointSchema,
  components: z.array(staticComponentSchema).min(1),
  anchors: z.record(z.string().min(1), pointSchema),
  effectSlot: effectSlotSchema.optional(),
}).strict();
const resolvedRouteStageSchema = z.object({
  id: z.string().min(1),
  actionId: z.enum(OFFICE_CALIBRATION_ACTION_IDS),
  points: z.array(pointSchema).min(1),
  durationMs: z.number().finite().positive(),
  flipX: z.boolean(),
  reverse: z.boolean().optional(),
}).strict();
const resolvedHandoffSchema = z.object({
  sourceStationId: z.string().min(1),
  targetStationId: z.string().min(1),
  outbound: z.array(resolvedRouteStageSchema).min(1),
  standingTalk: pointSchema,
  seatedTalk: pointSchema,
  salute: pointSchema,
  return: z.array(resolvedRouteStageSchema).min(1),
}).strict();

export const officeCalibrationDocumentSchema = z.object({
  schemaVersion: z.literal(OFFICE_CALIBRATION_SCHEMA_VERSION),
  world: z.object({ width: z.number().finite().positive(), height: z.number().finite().positive() }).strict(),
  layers: z.array(layerSchema),
  actionVisualAlignments: z.record(z.string().min(1), actionVisualAlignmentSchema),
  transitionDirections: z.record(z.string().min(1), transitionDirectionSchema),
  stations: z.object({ columnStep: z.number().finite().positive(), items: z.array(stationSchema).min(1) }).strict(),
  stationTemplates: z.record(z.string().min(1), stationTemplateSchema),
  facilities: z.record(z.string().min(1), facilitySchema),
  routes: z.record(z.string().min(1), z.record(z.string().min(1), z.array(resolvedRouteStageSchema).min(1))),
  handoffs: z.record(z.string().min(1), z.record(z.string().min(1), resolvedHandoffSchema)),
}).strict();

export type OfficeCalibrationDocument = z.infer<typeof officeCalibrationDocumentSchema>;
export type OfficeCalibrationPoint = z.infer<typeof pointSchema>;
export type OfficeStaticComponent = z.infer<typeof staticComponentSchema>;

export function parseOfficeCalibrationDocument(value: unknown): Readonly<OfficeCalibrationDocument> {
  const document = officeCalibrationDocumentSchema.parse(value);
  assertExactKeys(document.layers, OFFICE_CALIBRATION_LAYERS, "layers");
  assertExactKeys(Object.keys(document.actionVisualAlignments), OFFICE_CALIBRATION_ACTION_IDS, "action visual alignments");
  assertExactKeys(Object.keys(document.stationTemplates), ["standard", "main"], "station templates");
  assertExactKeys(Object.keys(document.facilities), OFFICE_CALIBRATION_FACILITY_IDS, "facilities");

  assertUnique(document.stations.items.map((station) => station.stationId), "station ids");
  assertUnique(document.stations.items.map((station) => station.preferredRoleId), "preferred role ids");
  for (const station of document.stations.items) {
    if (!(station.stationTemplateId in document.stationTemplates)) {
      throw new Error(`Office station ${station.stationId} references unknown template ${station.stationTemplateId}.`);
    }
  }
  for (const [templateId, template] of Object.entries(document.stationTemplates)) {
    assertUnique(template.components.map((component) => component.componentId), `component ids in station template ${templateId}`);
    assertRequiredComponents(template.components, ["shadow", "desk", "monitor", "chair"], `station template ${templateId}`);
  }
  for (const [facilityId, facility] of Object.entries(document.facilities)) {
    assertUnique(facility.components.map((component) => component.componentId), `component ids in facility ${facilityId}`);
    assertRequiredComponents(facility.components, ["body"], `facility ${facilityId}`);
  }
  const stationIds = document.stations.items.map((station) => station.stationId);
  assertExactKeys(Object.keys(document.routes), stationIds, "facility route stations");
  assertExactKeys(Object.keys(document.handoffs), stationIds, "handoff source stations");
  for (const stationId of stationIds) {
    assertExactKeys(Object.keys(document.routes[stationId] ?? {}), OFFICE_CALIBRATION_FACILITY_IDS, `facility routes for ${stationId}`);
    assertExactKeys(Object.keys(document.handoffs[stationId] ?? {}), stationIds.filter((targetId) => targetId !== stationId), `handoff targets for ${stationId}`);
    for (const [targetId, handoff] of Object.entries(document.handoffs[stationId] ?? {})) {
      if (handoff.sourceStationId !== stationId || handoff.targetStationId !== targetId) {
        throw new Error(`Office handoff identity does not match ${stationId}/${targetId}.`);
      }
    }
  }
  return deepFreeze(document);
}

export function parseOfficeCalibrationJson(source: string): Readonly<OfficeCalibrationDocument> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error("Office calibration is not valid JSON.", { cause: error });
  }
  return parseOfficeCalibrationDocument(value);
}

function assertRequiredComponents(components: readonly OfficeStaticComponent[], required: readonly string[], owner: string): void {
  const ids = new Set(components.map((component) => component.componentId));
  for (const id of required) if (!ids.has(id)) throw new Error(`Office ${owner} is missing component ${id}.`);
}

function assertExactKeys(actual: readonly string[], expected: readonly string[], label: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`Office calibration ${label} must contain exactly ${right.join(", ")}.`);
  }
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Office calibration ${label} must be unique.`);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
