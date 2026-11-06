import { describe, expect, it } from "vitest";
import {
  ROOM_DEFINITIONS,
  isValidShareSettings,
  shareSettingsForMode,
} from "../shared/types.js";

describe("rooms and screen-quality profiles", () => {
  it("creates ten identical rooms with ten seats each", () => {
    expect(ROOM_DEFINITIONS).toHaveLength(10);
    expect(
      ROOM_DEFINITIONS.every(
        (room, index) =>
          room.name === `房间${index + 1}` && room.capacity === 10,
      ),
    ).toBe(true);
  });

  it("accepts every standardized quality profile", () => {
    expect(
      isValidShareSettings(shareSettingsForMode("lite")),
    ).toBe(true);
    expect(
      isValidShareSettings(shareSettingsForMode("smooth")),
    ).toBe(true);
    expect(
      isValidShareSettings(shareSettingsForMode("standard")),
    ).toBe(true);
    expect(
      isValidShareSettings(shareSettingsForMode("hd")),
    ).toBe(true);
    expect(
      isValidShareSettings(shareSettingsForMode("ultra")),
    ).toBe(true);
    expect(
      isValidShareSettings(shareSettingsForMode("gaming")),
    ).toBe(true);
    expect(
      isValidShareSettings(shareSettingsForMode("fourK")),
    ).toBe(true);
  });

  it("rejects arbitrary changes to a standardized profile", () => {
    expect(
      isValidShareSettings({
        ...shareSettingsForMode("standard"),
        bitrateKbps: 4_000,
      }),
    ).toBe(false);
    expect(
      isValidShareSettings({
        ...shareSettingsForMode("gaming"),
        frameRate: 30,
      }),
    ).toBe(false);
    expect(
      isValidShareSettings({
        ...shareSettingsForMode("standard"),
        systemAudioEnabled: "yes" as unknown as boolean,
      }),
    ).toBe(false);
  });
});
