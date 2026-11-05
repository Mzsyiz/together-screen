import { describe, expect, it } from "vitest";
import type { ShareSettings } from "../shared/types";
import { wtnScreenSendEncoding } from "./wtn-client";

describe("WTN screen encoding", () => {
  it("keeps the automatic preview near 360p and 300 Kbps even from a 4K source", () => {
    const settings: ShareSettings = {
      resolution: "2160p",
      frameRate: 30,
      bitrateKbps: 24_000,
    };

    expect(wtnScreenSendEncoding("preview", settings, 2160)).toEqual({
      scaleResolutionDownBy: 6,
      maxBitrate: 300_000,
      maxFramerate: 15,
    });
  });

  it("publishes the selected 2K and 4K HD bitrate at full source scale", () => {
    const twoK: ShareSettings = {
      resolution: "1440p",
      frameRate: 60,
      bitrateKbps: 15_000,
    };
    expect(wtnScreenSendEncoding("hd", twoK, 1440)).toEqual({
      scaleResolutionDownBy: 1,
      maxBitrate: 15_000_000,
      maxFramerate: 60,
    });

    const fourK: ShareSettings = {
      resolution: "2160p",
      frameRate: 30,
      bitrateKbps: 30_000,
    };
    expect(wtnScreenSendEncoding("hd", fourK, 2160)).toEqual({
      scaleResolutionDownBy: 1,
      maxBitrate: 30_000_000,
      maxFramerate: 30,
    });
  });
});
