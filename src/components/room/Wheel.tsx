'use client';

import { useEffect, useRef, useState } from 'react';

export interface WheelCandidate {
  key: string;
  name: string;
  department?: string;
}

interface WheelProps {
  /** 转盘扇区：所有可参与抽奖的候选人 */
  candidates: WheelCandidate[];
  /** 后端确定的中奖者（按抽取顺序逐个停轮） */
  winners: WheelCandidate[];
  /** 全部转完后的回调 */
  onComplete: () => void;
  /** 转盘直径（px） */
  size?: number;
}

// 简约蓝白风：白底为主，#1890ff（rgb(24,144,255)）为辅助色
const SECTOR_WHITE = '#ffffff';
const SECTOR_LIGHT_BLUE = '#e6f4ff';
const BLUE = '#1890ff';

const TURNS = 5; // 每次旋转至少 5 整圈

/** 极坐标 → SVG 直角坐标。angleFromTop 以 12 点钟为 0°，顺时针递增 */
function polarToCartesian(cx: number, cy: number, r: number, angleFromTop: number) {
  const a = ((angleFromTop - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** 生成单个扇区的 SVG path（顺时针绘制） */
function sectorPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
}

export default function Wheel({ candidates, winners, onComplete, size = 300 }: WheelProps) {
  const cx = 100;
  const cy = 100;
  const r = 96;
  const N = candidates.length;
  const seg = N > 0 ? 360 / N : 360;

  const [rotation, setRotation] = useState(0);
  const [spinIndex, setSpinIndex] = useState(0);
  const [duration, setDuration] = useState(4.5);
  const currentRotationRef = useRef(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 中奖者在扇区中的下标（按 key 匹配）
  const winnerIndices = winners
    .map((w) => candidates.findIndex((c) => c.key === w.key))
    .filter((i) => i >= 0);

  const spinTo = (winnerSectorIdx: number, dur: number) => {
    const targetMod = (360 - (winnerSectorIdx * seg + seg / 2)) % 360;
    const base = currentRotationRef.current;
    const delta = ((targetMod - (base % 360)) + 360) % 360;
    const next = base + 360 * TURNS + delta;
    currentRotationRef.current = next;
    setDuration(dur);
    setRotation(next);
  };

  // 启动第一轮旋转
  // 注意：不使用 startedRef 做 guard 的原因是用 ref 在 React Strict Mode 双挂载时会残留 true，
  // 导致第二次挂载的 effect 直接退出而不启动旋转。这里用 completedRef 和 cleanup 来保证正确行为。
  useEffect(() => {
    if (N === 0 || winnerIndices.length === 0) return;
    completedRef.current = false;
    currentRotationRef.current = 0;
    setRotation(0);
    setSpinIndex(0);

    const firstIdx = winnerIndices[0];
    const t = setTimeout(() => {
      // 让目标扇区中心停在顶部指针处（12 点钟方向）
      const targetMod = (360 - (firstIdx * seg + seg / 2)) % 360;
      const delta = ((targetMod - 0) + 360) % 360;
      const next = 360 * TURNS + delta;
      currentRotationRef.current = next;
      setDuration(4.5);
      setRotation(next);
    }, 60);

    return () => {
      clearTimeout(t);
      // Strict Mode 双挂载：第一次 mount 被清理时，重置状态
      // 第二次 mount 会重新执行 effect，正常启动旋转
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, winnerIndices.length]);

  const handleTransitionEnd = () => {
    if (completedRef.current) return;
    if (spinIndex < winnerIndices.length - 1) {
      const nextIndex = spinIndex + 1;
      setSpinIndex(nextIndex);
      setTimeout(() => spinTo(winnerIndices[nextIndex], 3.6), 50);
    } else {
      completedRef.current = true;
      setTimeout(() => onCompleteRef.current(), 500);
    }
  };

  const showLabels = N <= 30;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        margin: '0 auto',
        userSelect: 'none',
      }}
    >
      {/* 转盘本体 */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: '50% 50%',
          transition: `transform ${duration}s cubic-bezier(0.17, 0.67, 0.12, 0.99)`,
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {N > 0 &&
          candidates.map((c, i) => {
            const start = i * seg;
            const end = (i + 1) * seg;
            const mid = start + seg / 2;
            const color = i % 2 === 0 ? SECTOR_WHITE : SECTOR_LIGHT_BLUE;
            const labelPos = polarToCartesian(cx, cy, r * 0.62, mid);
            const name = c.name.length > 6 ? c.name.slice(0, 6) : c.name;
            return (
              <g key={c.key}>
                <path
                  d={sectorPath(cx, cy, r, start, end)}
                  fill={color}
                  stroke={BLUE}
                  strokeWidth={0.8}
                />
                {showLabels && (
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    fill="#1a1a2e"
                    fontSize={N > 16 ? 5 : 6.5}
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${mid} ${labelPos.x} ${labelPos.y})`}
                  >
                    {name}
                  </text>
                )}
              </g>
            );
          })}
        {/* 外圈描边 */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={BLUE} strokeWidth={2.5} />
      </svg>

      {/* 中心轴：白底蓝边，静态图标，不剧透 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: '50%',
          background: '#fff',
          border: `2.5px solid ${BLUE}`,
          color: BLUE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.08,
          fontWeight: 700,
          boxShadow: '0 1px 4px rgba(24,144,255,0.2)',
          pointerEvents: 'none',
        }}
      >
        🎉
      </div>

      {/* 顶部指针（固定不转） */}
      <div
        style={{
          position: 'absolute',
          top: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: `22px solid ${BLUE}`,
          zIndex: 2,
        }}
      />
    </div>
  );
}