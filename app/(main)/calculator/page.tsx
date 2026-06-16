"use client";

import { useMemo, useState } from "react";

function toNumber(value: string): number {
  const raw = value.replace(/[^\d.-]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

type MaterialKind = "" | "foam" | "concrete";
type BrickRow = { id: string; lengthInput: string; material: MaterialKind };
type ZendaiRow = { id: string; widthInput: string; heightInput: string; material: MaterialKind };

function newRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CalculatorPage() {
  const [tilePlace, setTilePlace] = useState("화장실");
  const [floorWidthInput, setFloorWidthInput] = useState("");
  const [floorLengthInput, setFloorLengthInput] = useState("");
  const [wallHeightInput, setWallHeightInput] = useState("");
  const [floorLevelHeightCmInput, setFloorLevelHeightCmInput] = useState("4");
  const [boxAreaInput, setBoxAreaInput] = useState("1.44");
  const [lossRateInput, setLossRateInput] = useState("15");
  const [subExtraInput, setSubExtraInput] = useState("0");
  const [brickRows, setBrickRows] = useState<BrickRow[]>([
    { id: newRowId(), lengthInput: "", material: "concrete" },
  ]);
  const [zendaiRows, setZendaiRows] = useState<ZendaiRow[]>([
    { id: newRowId(), widthInput: "", heightInput: "", material: "concrete" },
  ]);
  const [groutTileWidthInput, setGroutTileWidthInput] = useState("");
  const [groutTileHeightInput, setGroutTileHeightInput] = useState("");
  const [groutTileDepthInput, setGroutTileDepthInput] = useState("");
  const [groutGapInput, setGroutGapInput] = useState("");
  const [groutAreaInput, setGroutAreaInput] = useState("");

  const floorWidth = toNumber(floorWidthInput);
  const floorLength = toNumber(floorLengthInput);
  const wallHeight = toNumber(wallHeightInput);
  const floorLevelHeightM = toNumber(floorLevelHeightCmInput) / 100;
  const effectiveFloorLevelHeightM = floorLevelHeightM;
  const floorArea = useMemo(
    () => Math.max(0, floorWidth * floorLength),
    [floorWidth, floorLength]
  );
  const wallArea = useMemo(() => {
    if (floorWidth <= 0 || floorLength <= 0 || wallHeight <= 0) return 0;
    return (floorWidth * 2 + floorLength * 2) * wallHeight;
  }, [floorWidth, floorLength, wallHeight]);
  const tileArea = useMemo(() => floorArea + wallArea, [floorArea, wallArea]);
  const boxArea = toNumber(boxAreaInput);
  const lossRate = toNumber(lossRateInput);
  const subExtra = Math.max(0, Math.round(toNumber(subExtraInput)));
  const brickArea = useMemo(
    () =>
      brickRows.reduce((sum, row) => {
        const len = toNumber(row.lengthInput);
        return sum + Math.max(0, len * wallHeight * 2); // 조적벽 양면
      }, 0),
    [brickRows, wallHeight]
  );
  const zendaiArea = useMemo(
    () =>
      zendaiRows.reduce((sum, row) => {
        const w = toNumber(row.widthInput);
        const h = toNumber(row.heightInput);
        return sum + Math.max(0, w * h);
      }, 0),
    [zendaiRows]
  );
  const masonryArea = useMemo(() => brickArea + zendaiArea, [brickArea, zendaiArea]);
  const totalConstructionArea = useMemo(
    () => floorArea + wallArea + brickArea,
    [floorArea, wallArea, brickArea]
  );

  const floorTileBoxQty = useMemo(() => {
    if (floorArea <= 0 || boxArea <= 0) return 0;
    return Math.ceil((floorArea * (1 + lossRate / 100)) / boxArea);
  }, [floorArea, boxArea, lossRate]);
  const wallTileBoxQty = useMemo(() => {
    if (floorWidth <= 0 || floorLength <= 0 || wallHeight <= 0 || boxArea <= 0) return 0;
    // 요청 공식: (바닥가로 + 세로) * 2 * 높이 / 박스면적
    const wallM2 = (floorWidth + floorLength) * 2 * wallHeight;
    const wallTileM2 = Math.max(0, wallM2 - brickArea); // 조적벽 면적 제외
    return Math.ceil((wallTileM2 * (1 + lossRate / 100)) / boxArea);
  }, [floorWidth, floorLength, wallHeight, boxArea, lossRate, brickArea]);
  const brickTileBoxQty = useMemo(() => {
    if (brickArea <= 0 || boxArea <= 0) return 0;
    // 요청 공식: (나오는 길이×높이×2) / 박스면적 + 여유율
    return Math.ceil((brickArea * (1 + lossRate / 100)) / boxArea);
  }, [brickArea, boxArea, lossRate]);
  // 부자재 공통 간편 기준(필요시 현장 여건에 맞춰 보정)
  const floorAdhesiveQty = useMemo(
    () => Math.max(0, Math.ceil(floorArea / 3) + subExtra), // 바닥면적 ÷ 3㎡ + 부자재 여유추가(개), 올림
    [floorArea, subExtra]
  );
  const wallEpoxyQty = useMemo(
    () => Math.max(0, Math.ceil((wallArea + brickArea) / 6) + subExtra), // 벽면(조적벽 포함) ÷ 6㎡ + 여유추가
    [wallArea, brickArea, subExtra]
  );
  const remitalQty = useMemo(
    () => Math.max(0, Math.ceil((floorArea * effectiveFloorLevelHeightM) / 0.025) + subExtra),
    [floorArea, effectiveFloorLevelHeightM, subExtra]
  );
  const concreteArea = useMemo(() => {
    const brick = brickRows.reduce((sum, row) => {
      const len = toNumber(row.lengthInput);
      const area = Math.max(0, len * wallHeight * 2);
      return row.material === "concrete" ? sum + area : sum;
    }, 0);
    const zendai = zendaiRows.reduce((sum, row) => {
      const area = Math.max(0, toNumber(row.widthInput) * toNumber(row.heightInput));
      return row.material === "concrete" ? sum + area : sum;
    }, 0);
    return brick + zendai;
  }, [brickRows, zendaiRows, wallHeight]);
  const foamArea = useMemo(() => {
    const brick = brickRows.reduce((sum, row) => {
      const len = toNumber(row.lengthInput);
      const area = Math.max(0, len * wallHeight); // 폼세라믹은 단면 기준
      return row.material === "foam" ? sum + area : sum;
    }, 0);
    const zendai = zendaiRows.reduce((sum, row) => {
      const area = Math.max(0, toNumber(row.widthInput) * toNumber(row.heightInput));
      return row.material === "foam" ? sum + area : sum;
    }, 0);
    return brick + zendai;
  }, [brickRows, zendaiRows, wallHeight]);
  const CONCRETE_BRICK_M2 = 0.01083; // 190x57(mm) 정확 면적 기준
  const concreteBrickQty = useMemo(
    () => Math.max(0, Math.ceil(concreteArea / CONCRETE_BRICK_M2) + subExtra),
    [concreteArea, subExtra]
  );
  const FOAM_CERAMIC_M2 = 1.2 * 0.6; // 1200x600(mm)
  const foamCeramicQty = useMemo(
    () => Math.max(0, Math.ceil(foamArea / FOAM_CERAMIC_M2) + subExtra), // 면적/판면적 올림 + 여유추가
    [foamArea, subExtra]
  );

  const groutTileWidth = toNumber(groutTileWidthInput);
  const groutTileHeight = toNumber(groutTileHeightInput);
  const groutTileDepth = toNumber(groutTileDepthInput);
  const groutGap = toNumber(groutGapInput);
  const groutArea = toNumber(groutAreaInput);
  const groutIsValid =
    groutTileWidth > 0 &&
    groutTileHeight > 0 &&
    groutTileDepth > 0 &&
    groutGap > 0 &&
    groutArea > 0;
  const groutKg = useMemo(() => {
    if (!groutIsValid) return null;
    const raw =
      ((groutTileWidth + groutTileHeight) / (groutTileWidth * groutTileHeight)) *
      groutGap *
      groutTileDepth *
      groutArea *
      (28 / 15);
    return Math.floor(raw * 10) / 10;
  }, [groutIsValid, groutTileWidth, groutTileHeight, groutGap, groutTileDepth, groutArea]);
  const groutPackQty = useMemo(() => {
    if (groutKg === null) return null;
    return Math.ceil(groutKg / 3);
  }, [groutKg]);

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-gray-900">편의 계산기</h1>
      <p className="mt-1 text-sm text-gray-600">
        현장에서 자주 쓰는 계산을 빠르게 확인할 수 있습니다.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">1번 타일+부자재 계산기</h2>
          <div className="mt-3 space-y-3">
            <label className="block text-sm text-gray-700">
              장소 선택
              <select
                value={tilePlace}
                onChange={(e) => setTilePlace(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="화장실">화장실</option>
                <option value="현관타일">현관타일</option>
                <option value="일반벽면">일반벽면</option>
                <option value="베란다">베란다</option>
              </select>
            </label>
            <label className="block text-sm text-gray-700">
              바닥 가로(m)
              <input
                type="text"
                inputMode="decimal"
                value={floorWidthInput}
                onChange={(e) => setFloorWidthInput(e.target.value)}
                placeholder="예: 1.8"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              바닥 세로(m)
              <input
                type="text"
                inputMode="decimal"
                value={floorLengthInput}
                onChange={(e) => setFloorLengthInput(e.target.value)}
                placeholder="예: 2.2"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              벽 높이(m)
              <input
                type="text"
                inputMode="decimal"
                value={wallHeightInput}
                onChange={(e) => setWallHeightInput(e.target.value)}
                placeholder="예: 2.3"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              바닥 레벨 높이(cm)
              <input
                type="text"
                inputMode="decimal"
                value={floorLevelHeightCmInput}
                onChange={(e) => setFloorLevelHeightCmInput(e.target.value)}
                placeholder="예: 4"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              박스당 면적(㎡)
              <input
                type="text"
                inputMode="decimal"
                value={boxAreaInput}
                onChange={(e) => setBoxAreaInput(e.target.value)}
                placeholder="예: 1.44"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              여유율(%)
              <input
                type="text"
                inputMode="decimal"
                value={lossRateInput}
                onChange={(e) => setLossRateInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              부자재 여유추가(개)
              <input
                type="text"
                inputMode="numeric"
                value={subExtraInput}
                onChange={(e) => setSubExtraInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-sm font-medium text-gray-700">추가 체크항목</p>
              <div className="space-y-3">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">조적벽</p>
                    <button
                      type="button"
                      onClick={() =>
                        setBrickRows((prev) => [
                          ...prev,
                          { id: newRowId(), lengthInput: "", material: "concrete" },
                        ])
                      }
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      + 추가
                    </button>
                  </div>
                  <div className="space-y-2">
                    {brickRows.map((row, idx) => (
                      <div key={row.id} className="rounded border border-gray-200 bg-white p-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.lengthInput}
                            onChange={(e) =>
                              setBrickRows((prev) =>
                                prev.map((x) =>
                                  x.id === row.id ? { ...x, lengthInput: e.target.value } : x
                                )
                              )
                            }
                            placeholder={`조적 길이(m) #${idx + 1}`}
                            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                          />
                          {brickRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setBrickRows((prev) => prev.filter((x) => x.id !== row.id))
                              }
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-700">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={row.material === "foam"}
                              onChange={(e) =>
                                setBrickRows((prev) =>
                                  prev.map((x) =>
                                    x.id === row.id
                                      ? { ...x, material: e.target.checked ? "foam" : "" }
                                      : x
                                  )
                                )
                              }
                            />
                            폼세라믹
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={row.material === "concrete"}
                              onChange={(e) =>
                                setBrickRows((prev) =>
                                  prev.map((x) =>
                                    x.id === row.id
                                      ? { ...x, material: e.target.checked ? "concrete" : "" }
                                      : x
                                  )
                                )
                              }
                            />
                            콘크리트 벽돌
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">젠다이</p>
                    <button
                      type="button"
                      onClick={() =>
                        setZendaiRows((prev) => [
                          ...prev,
                          { id: newRowId(), widthInput: "", heightInput: "", material: "concrete" },
                        ])
                      }
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      + 추가
                    </button>
                  </div>
                  <div className="space-y-2">
                    {zendaiRows.map((row, idx) => (
                      <div key={row.id} className="rounded border border-gray-200 bg-white p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.widthInput}
                            onChange={(e) =>
                              setZendaiRows((prev) =>
                                prev.map((x) =>
                                  x.id === row.id ? { ...x, widthInput: e.target.value } : x
                                )
                              )
                            }
                            placeholder={`가로(m) #${idx + 1}`}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.heightInput}
                            onChange={(e) =>
                              setZendaiRows((prev) =>
                                prev.map((x) =>
                                  x.id === row.id ? { ...x, heightInput: e.target.value } : x
                                )
                              )
                            }
                            placeholder={`세로(m) #${idx + 1}`}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                            <label className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={row.material === "foam"}
                                onChange={(e) =>
                                  setZendaiRows((prev) =>
                                    prev.map((x) =>
                                      x.id === row.id
                                        ? { ...x, material: e.target.checked ? "foam" : "" }
                                        : x
                                    )
                                  )
                                }
                              />
                              폼세라믹
                            </label>
                            <label className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={row.material === "concrete"}
                                onChange={(e) =>
                                  setZendaiRows((prev) =>
                                    prev.map((x) =>
                                      x.id === row.id
                                        ? { ...x, material: e.target.checked ? "concrete" : "" }
                                        : x
                                    )
                                  )
                                }
                              />
                              콘크리트 벽돌
                            </label>
                          </div>
                          {zendaiRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setZendaiRows((prev) => prev.filter((x) => x.id !== row.id))
                              }
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-1 rounded-md bg-gray-50 p-3 text-sm">
            <p>선택 장소: <strong>{tilePlace}</strong></p>
            <p>바닥 면적: <strong>{floorArea.toFixed(2)}㎡</strong></p>
            <p>벽면 면적: <strong>{wallArea.toFixed(2)}㎡</strong></p>
            <p>조적벽 면적: <strong>{brickArea.toFixed(2)}㎡</strong></p>
            <p>총 시공 면적: <strong>{totalConstructionArea.toFixed(2)}㎡</strong></p>
            <p>바닥타일 박스수(박스당 {boxAreaInput || "1.44"}㎡): <strong>{floorTileBoxQty.toLocaleString("ko-KR")}박스</strong></p>
            <p>벽면타일 박스수(박스당 {boxAreaInput || "1.44"}㎡): <strong>{wallTileBoxQty.toLocaleString("ko-KR")}박스</strong></p>
            {brickArea > 0 ? (
              <p>조적벽 타일 박스수(양면, 박스당 {boxAreaInput || "1.44"}㎡): <strong>{brickTileBoxQty.toLocaleString("ko-KR")}박스</strong></p>
            ) : null}
            <p>바닥압착: <strong>{floorAdhesiveQty.toLocaleString("ko-KR")}포</strong></p>
            <p>에폭시 기준 면적(벽면+조적벽): <strong>{(wallArea + brickArea).toFixed(2)}㎡</strong></p>
            <p className="pl-2 text-gray-600">- 벽면 면적: {wallArea.toFixed(2)}㎡ / 조적벽 면적: {brickArea.toFixed(2)}㎡</p>
            <p>벽면 에폭시: <strong>{wallEpoxyQty.toLocaleString("ko-KR")}세트</strong></p>
            <p>레미탈: <strong>{remitalQty.toLocaleString("ko-KR")}포</strong></p>
            <p>조적+젠다이 면적: <strong>{masonryArea.toFixed(2)}㎡</strong></p>
            {concreteArea > 0 ? (
              <p>콘크리트벽돌: <strong>{concreteBrickQty.toLocaleString("ko-KR")}장</strong></p>
            ) : null}
            {foamArea > 0 ? (
              <p>폼세라믹: <strong>{foamCeramicQty.toLocaleString("ko-KR")}개</strong></p>
            ) : null}
            {concreteArea <= 0 && foamArea <= 0 ? (
              <p>조적/젠다이 자재를 선택해 주세요(폼세라믹/콘크리트 벽돌).</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">2번 푸가벨라 줄눈 계산기</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-gray-700">
              타일 가로(mm)
              <input
                type="text"
                inputMode="decimal"
                value={groutTileWidthInput}
                onChange={(e) => setGroutTileWidthInput(e.target.value)}
                placeholder="mm"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              타일 세로(mm)
              <input
                type="text"
                inputMode="decimal"
                value={groutTileHeightInput}
                onChange={(e) => setGroutTileHeightInput(e.target.value)}
                placeholder="mm"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              타일 두께(mm)
              <input
                type="text"
                inputMode="decimal"
                value={groutTileDepthInput}
                onChange={(e) => setGroutTileDepthInput(e.target.value)}
                placeholder="mm"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-gray-700">
              줄눈 간격(mm)
              <input
                type="text"
                inputMode="decimal"
                value={groutGapInput}
                onChange={(e) => setGroutGapInput(e.target.value)}
                placeholder="mm"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="mt-3 block text-sm text-gray-700">
            시공 면적(㎡)
            <input
              type="text"
              inputMode="decimal"
              value={groutAreaInput}
              onChange={(e) => setGroutAreaInput(e.target.value)}
              placeholder="㎡"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          {groutKg !== null && groutPackQty !== null ? (
            <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm">
              <p>
                예상 소요량: <strong>{groutKg.toFixed(1)} kg</strong>
              </p>
              <p className="mt-1">
                필요 팩수: <strong>{groutPackQty.toLocaleString("ko-KR")}팩 (3kg 기준)</strong>
              </p>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-gray-500">※현장 상황에 따라 소요량은 차이날 수 있습니다.</p>
        </section>
      </div>
    </div>
  );
}

