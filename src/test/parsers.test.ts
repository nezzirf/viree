// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { FitBaseType, FitEncoder } from "fit-file-parser";
import { parseFit, parseGpx, parseTcx, ImportError } from "@/lib/parsers";
import { toGpx } from "@/lib/gpx";
import type { TrackPoint } from "@/lib/geo";

const track: TrackPoint[] = [
  [5.72, 45.18, 210],
  [5.725, 45.185, 230.5],
  [5.73, 45.19, 260],
];

describe("GPX", () => {
  it("export puis import redonne la même trace et le même nom", () => {
    const gpx = toGpx("Boucle <test> & co", track);
    const a = parseGpx(gpx);
    expect(a.name).toBe("Boucle <test> & co");
    expect(a.points).toHaveLength(3);
    expect(a.points[1][0]).toBeCloseTo(5.725, 6);
    expect(a.points[1][2]).toBeCloseTo(230.5, 1);
  });

  it("lit les temps et la durée, et les fichiers sans altitude", () => {
    const gpx = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Matin</name><trkseg>
      <trkpt lat="45.1" lon="5.1"><time>2026-05-01T08:00:00Z</time></trkpt>
      <trkpt lat="45.2" lon="5.2"><time>2026-05-01T09:30:00Z</time></trkpt></trkseg></trk></gpx>`;
    const a = parseGpx(gpx);
    expect(a.date).toBe("2026-05-01T08:00:00.000Z");
    expect(a.durationS).toBe(5400);
    expect(a.points[0]).toEqual([5.1, 45.1]);
  });

  it("refuse un fichier vide ou cassé", () => {
    expect(() => parseGpx("<gpx></gpx>")).toThrow(ImportError);
    expect(() => parseGpx("<gpx><trk>")).toThrow(ImportError);
  });
});

describe("TCX", () => {
  it("lit positions, altitudes et ignore les points sans GPS", () => {
    const tcx = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
      <Activities><Activity Sport="Biking"><Lap><Track>
      <Trackpoint><Time>2026-05-01T08:00:00Z</Time><Position><LatitudeDegrees>45.1</LatitudeDegrees><LongitudeDegrees>5.1</LongitudeDegrees></Position><AltitudeMeters>300</AltitudeMeters></Trackpoint>
      <Trackpoint><Time>2026-05-01T08:00:05Z</Time><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint>
      <Trackpoint><Time>2026-05-01T08:10:00Z</Time><Position><LatitudeDegrees>45.11</LatitudeDegrees><LongitudeDegrees>5.11</LongitudeDegrees></Position><AltitudeMeters>320</AltitudeMeters></Trackpoint>
      </Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const a = parseTcx(tcx);
    expect(a.points).toEqual([
      [5.1, 45.1, 300],
      [5.11, 45.11, 320],
    ]);
    expect(a.durationS).toBe(600);
  });
});

describe("FIT", () => {
  it("lit les enregistrements d'un fichier FIT", async () => {
    const semi = (deg: number) => Math.round((deg * 2 ** 31) / 180);
    const enc = new FitEncoder();
    // file_id : type 4 = activité
    enc.writeMessage(0, [{ number: 0, size: 1, baseType: FitBaseType.Enum, value: 4 }]);
    const t0 = new Date("2026-05-01T08:00:00Z");
    track.forEach((p, i) => {
      enc.writeMessage(20, [
        { number: 253, size: 4, baseType: FitBaseType.Uint32, value: FitEncoder.toFitTimestamp(new Date(t0.getTime() + i * 60000)) },
        { number: 0, size: 4, baseType: FitBaseType.Sint32, value: semi(p[1]) },
        { number: 1, size: 4, baseType: FitBaseType.Sint32, value: semi(p[0]) },
        // altitude : échelle 5, décalage 500
        { number: 2, size: 2, baseType: FitBaseType.Uint16, value: Math.round((p[2]! + 500) * 5) },
      ]);
    });
    const bytes = enc.close();
    const a = await parseFit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(a.points).toHaveLength(3);
    expect(a.points[2][1]).toBeCloseTo(45.19, 5);
    expect(a.points[2][2]).toBeCloseTo(260, 0);
    expect(a.durationS).toBe(120);
    expect(a.date).toBe(t0.toISOString());
  });
});
