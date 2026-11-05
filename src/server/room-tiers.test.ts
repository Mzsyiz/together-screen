import { describe, expect, it } from "vitest";
import {
  ROOM_DEFINITIONS,
  mediaModeAllowedForTier,
  shareSettingsForMode,
  shareSettingsAllowedForTier,
} from "../shared/types.js";

describe("room cost tiers", () => {
  it("assigns the fixed 2-6 person rooms to three tiers", () => {
    expect(
      ROOM_DEFINITIONS.map((room) => [room.id, room.tier]),
    ).toEqual([
      ["room-2", "normal"],
      ["room-3", "normal"],
      ["room-4", "normal"],
      ["room-5", "normal"],
      ["room-6", "normal"],
      ["advanced-2", "advanced"],
      ["advanced-3", "advanced"],
      ["advanced-4", "advanced"],
      ["advanced-5", "advanced"],
      ["advanced-6", "advanced"],
      ["ultimate-2", "ultimate"],
      ["ultimate-3", "ultimate"],
      ["ultimate-4", "ultimate"],
      ["ultimate-5", "ultimate"],
      ["ultimate-6", "ultimate"],
    ]);
  });

  it("restricts ordinary rooms to self-hosted 720p and 3 Mbps", () => {
    expect(mediaModeAllowedForTier("normal", "p2p")).toBe(true);
    expect(mediaModeAllowedForTier("normal", "wtn")).toBe(false);
    expect(
      shareSettingsAllowedForTier(
        "normal",
        shareSettingsForMode("normal", "standard"),
      ),
    ).toBe(true);
    expect(
      shareSettingsAllowedForTier("normal", {
        qualityMode: "standard",
        resolution: "1080p",
        frameRate: 15,
        bitrateKbps: 2500,
        degradationPreference: "maintain-resolution",
      }),
    ).toBe(false);
    expect(
      shareSettingsAllowedForTier("normal", {
        qualityMode: "hd",
        resolution: "720p",
        frameRate: 30,
        bitrateKbps: 3000,
        degradationPreference: "balanced",
      }),
    ).toBe(true);
    expect(
      shareSettingsAllowedForTier("normal", {
        qualityMode: "hd",
        resolution: "720p",
        frameRate: 30,
        bitrateKbps: 3500,
        degradationPreference: "balanced",
      }),
    ).toBe(false);
  });

  it("allows WTN and progressively higher quality only in paid tiers", () => {
    expect(mediaModeAllowedForTier("advanced", "wtn")).toBe(true);
    expect(
      shareSettingsAllowedForTier("advanced", {
        qualityMode: "ultra",
        resolution: "1440p",
        frameRate: 30,
        bitrateKbps: 8000,
        degradationPreference: "maintain-resolution",
      }),
    ).toBe(true);
    expect(
      shareSettingsAllowedForTier("advanced", {
        qualityMode: "fourK",
        resolution: "2160p",
        frameRate: 30,
        bitrateKbps: 20_000,
        degradationPreference: "maintain-resolution",
      }),
    ).toBe(false);
    expect(mediaModeAllowedForTier("ultimate", "wtn")).toBe(true);
    expect(
      shareSettingsAllowedForTier(
        "ultimate",
        shareSettingsForMode("ultimate", "fourK"),
      ),
    ).toBe(true);
    expect(
      shareSettingsAllowedForTier(
        "ultimate",
        shareSettingsForMode("ultimate", "gaming"),
      ),
    ).toBe(true);
  });
});
