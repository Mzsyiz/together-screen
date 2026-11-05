import { describe, expect, it } from "vitest";
import type { ShareSettings } from "../shared/types";
import { wtnScreenSendEncoding } from "./wtn-client";

describe("WTN screen encoding", () => {
  it("keeps the automatic preview near 360p and 300 Kbps even from a 4K source", () => {
    const settings: ShareSettings = {
      qualityMode: "fourK",
      resolution: "2160p",
      frameRate: 30,
      bitrateKbps: 20_000,
      degradationPreference: "maintain-resolution",
    };

    expect(wtnScreenSendEncoding("preview", settings, 2160)).toEqual({
      scaleResolutionDownBy: 6,
      maxBitrate: 300_000,
      maxFramerate: 15,
    });
  });

  it("publishes the selected 2K and 4K HD bitrate at full source scale", () => {
    const twoK: ShareSettings = {
      qualityMode: "ultra",
      resolution: "1440p",
      frameRate: 30,
      bitrateKbps: 8000,
      degradationPreference: "maintain-resolution",
    };
    expect(wtnScreenSendEncoding("hd", twoK, 1440)).toEqual({
      scaleResolutionDownBy: 1,
      maxBitrate: 8_000_000,
      maxFramerate: 30,
    });

    const fourK: ShareSettings = {
      qualityMode: "fourK",
      resolution: "2160p",
      frameRate: 30,
      bitrateKbps: 20_000,
      degradationPreference: "maintain-resolution",
    };
    expect(wtnScreenSendEncoding("hd", fourK, 2160)).toEqual({
      scaleResolutionDownBy: 1,
      maxBitrate: 20_000_000,
      maxFramerate: 30,
    });
  });
});
