import { describe, expect, it } from "vitest";
import {
  ROOM_DEFINITIONS,
  mediaModeAllowedForTier,
  shareSettingsAllowedForTier,
} from "../shared/types.js";

describe("room cost tiers", () => {
  it("assigns the fixed 2-6 person rooms to three tiers", () => {
    expect(
      ROOM_DEFINITIONS.map((room) => [room.id, room.tier]),
    ).toEqual([
      ["room-2", "normal"],
      ["room-3", "normal"],
      ["room-4", "advanced"],
      ["room-5", "advanced"],
      ["room-6", "ultimate"],
    ]);
  });

  it("restricts ordinary rooms to self-hosted 720p and 3 Mbps", () => {
    expect(mediaModeAllowedForTier("normal", "p2p")).toBe(true);
    expect(mediaModeAllowedForTier("normal", "wtn")).toBe(false);
    expect(
      shareSettingsAllowedForTier("normal", {
        resolution: "720p",
        frameRate: 30,
        bitrateKbps: 3000,
      }),
    ).toBe(true);
    expect(
      shareSettingsAllowedForTier("normal", {
        resolution: "1080p",
        frameRate: 30,
        bitrateKbps: 3000,
      }),
    ).toBe(false);
    expect(
      shareSettingsAllowedForTier("normal", {
        resolution: "720p",
        frameRate: 30,
        bitrateKbps: 3500,
      }),
    ).toBe(false);
  });

  it("allows WTN and progressively higher quality only in paid tiers", () => {
    expect(mediaModeAllowedForTier("advanced", "wtn")).toBe(true);
    expect(
      shareSettingsAllowedForTier("advanced", {
        resolution: "1440p",
        frameRate: 60,
        bitrateKbps: 15_000,
      }),
    ).toBe(true);
    expect(
      shareSettingsAllowedForTier("advanced", {
        resolution: "2160p",
        frameRate: 30,
        bitrateKbps: 10_000,
      }),
    ).toBe(false);
    expect(mediaModeAllowedForTier("ultimate", "wtn")).toBe(true);
    expect(
      shareSettingsAllowedForTier("ultimate", {
        resolution: "2160p",
        frameRate: 30,
        bitrateKbps: 30_000,
      }),
    ).toBe(true);
    expect(
      shareSettingsAllowedForTier("ultimate", {
        resolution: "source",
        frameRate: 30,
        bitrateKbps: 30_000,
      }),
    ).toBe(true);
  });
});
