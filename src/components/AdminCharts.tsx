'use client';

import React, { useState } from 'react';
import { BarChart3, PieChart, TrendingUp } from 'lucide-react';

export interface DailySeriesPoint {
  date: string;
  label: string;
  singleRevenue: number;
  monthlyRevenue: number;
  totalRevenue: number;
  approvedCount: number;
  uniquePreviews: number;
  totalPreviews: number;
  fullRenders: number;
  pdfs: number;
}

export interface TxStatusCounts {
  approved: number;
  pending: number;
  expired: number;
  rejected: number;
  pixApproved: number;
  cardApproved: number;
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdminCharts({
  dailySeries,
  txCounts,
}: {
  dailySeries: DailySeriesPoint[];
  txCounts: TxStatusCounts;
}) {
  const [hoveredRevIdx, setHoveredRevIdx] = useState<number | null>(null);
  const [hoveredUseIdx, setHoveredUseIdx] = useState<number | null>(null);

  const maxRev = Math.max(
    10,
    ...dailySeries.map((d) => d.totalRevenue)
  );
  const maxUse = Math.max(
    4,
    ...dailySeries.map((d) => d.uniquePreviews + d.fullRenders + d.pdfs)
  );

  const activeRevPoint =
    hoveredRevIdx !== null
      ? dailySeries[hoveredRevIdx]
      : dailySeries[dailySeries.length - 1] || null;
  const activeUsePoint =
    hoveredUseIdx !== null
      ? dailySeries[hoveredUseIdx]
      : dailySeries[dailySeries.length - 1] || null;

  const totalTx =
    txCounts.approved + txCounts.pending + txCounts.expired + txCounts.rejected;
  const safeTotalTx = Math.max(1, totalTx);
  const approvedTotalMethod = Math.max(
    1,
    txCounts.pixApproved + txCounts.cardApproved
  );

  const svgW = 640;
  const svgH = 160;
  const padX = 12;
  const padY = 14;
  const chartW = svgW - padX * 2;
  const chartH = svgH - padY * 2;
  const barSlot = dailySeries.length > 0 ? chartW / dailySeries.length : chartW;
  const barW = Math.max(3, Math.min(20, barSlot * 0.65));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* GRÁFICO 1: RECEITA DIÁRIA (AVULSOS VS MENSAIS) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-studio-900 border border-zinc-800 flex flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              <span>Receita Diária ({dailySeries.length}d)</span>
            </h3>
            {activeRevPoint && (
              <p className="text-[11px] text-zinc-300 mt-1">
                <strong className="text-white">{activeRevPoint.label}:</strong>{' '}
                <span className="text-emerald-400 font-bold">
                  {formatBRL(activeRevPoint.totalRevenue)}
                </span>{' '}
                ({activeRevPoint.approvedCount} pgto)
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-[#D97706]" />
              Mensal
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-sky-400" />
              Avulso
            </span>
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-xl bg-studio-950/90 border border-zinc-800/80 p-2">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-36 select-none"
            role="img"
            aria-label="Gráfico de receita diária"
          >
            {[0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padY + chartH * (1 - ratio);
              return (
                <line
                  key={ratio}
                  x1={padX}
                  x2={svgW - padX}
                  y1={y}
                  y2={y}
                  stroke="#27272a"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              );
            })}
            {dailySeries.map((pt, idx) => {
              const x = padX + idx * barSlot + (barSlot - barW) / 2;
              const monthlyH = (pt.monthlyRevenue / maxRev) * chartH;
              const singleH = (pt.singleRevenue / maxRev) * chartH;
              const totalH = monthlyH + singleH;
              const yMonthly = padY + chartH - monthlyH;
              const ySingle = yMonthly - singleH;
              const isHovered = hoveredRevIdx === idx;

              return (
                <g
                  key={pt.date}
                  onMouseEnter={() => setHoveredRevIdx(idx)}
                  onMouseLeave={() => setHoveredRevIdx(null)}
                  onClick={() => setHoveredRevIdx(idx)}
                  className="cursor-pointer"
                >
                  <title>{`${pt.label}: Total ${formatBRL(pt.totalRevenue)} (Mensal ${formatBRL(
                    pt.monthlyRevenue
                  )} | Avulso ${formatBRL(pt.singleRevenue)})`}</title>
                  <rect
                    x={padX + idx * barSlot}
                    y={0}
                    width={barSlot}
                    height={svgH}
                    fill={isHovered ? 'rgba(217, 119, 6, 0.08)' : 'transparent'}
                  />
                  {totalH <= 0 ? (
                    <rect
                      x={x}
                      y={padY + chartH - 2}
                      width={barW}
                      height={2}
                      rx={1}
                      fill="#27272a"
                    />
                  ) : (
                    <>
                      {monthlyH > 0 && (
                        <rect
                          x={x}
                          y={yMonthly}
                          width={barW}
                          height={Math.max(2, monthlyH)}
                          rx={singleH > 0 ? 0 : 2}
                          fill={isHovered ? '#F59E0B' : '#D97706'}
                        />
                      )}
                      {singleH > 0 && (
                        <rect
                          x={x}
                          y={ySingle}
                          width={barW}
                          height={Math.max(2, singleH)}
                          rx={2}
                          fill={isHovered ? '#7DD3FC' : '#38BDF8'}
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          {dailySeries.length > 0 && (
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono px-2 pt-1">
              <span>{dailySeries[0].label}</span>
              <span>{dailySeries[Math.floor(dailySeries.length / 2)].label}</span>
              <span>{dailySeries[dailySeries.length - 1].label}</span>
            </div>
          )}
        </div>
      </div>

      {/* GRÁFICO 2: USO DO MOTOR (PRÉVIAS ÚNICAS VS COMPLETAS VS PDFS) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-studio-900 border border-zinc-800 flex flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4" />
              <span>Uso Diário do Motor</span>
            </h3>
            {activeUsePoint && (
              <p className="text-[11px] text-zinc-300 mt-1">
                <strong className="text-white">{activeUsePoint.label}:</strong>{' '}
                {activeUsePoint.uniquePreviews} prévias ún. • {activeUsePoint.fullRenders}{' '}
                completas •{' '}
                <span className="text-sky-300 font-bold">{activeUsePoint.pdfs} PDFs</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-amber-400" />
              Prévias
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-400" />
              Full
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-sky-400" />
              PDF
            </span>
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-xl bg-studio-950/90 border border-zinc-800/80 p-2">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-36 select-none"
            role="img"
            aria-label="Gráfico de uso diário do motor"
          >
            {[0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padY + chartH * (1 - ratio);
              return (
                <line
                  key={ratio}
                  x1={padX}
                  x2={svgW - padX}
                  y1={y}
                  y2={y}
                  stroke="#27272a"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              );
            })}
            {dailySeries.map((pt, idx) => {
              const x = padX + idx * barSlot + (barSlot - barW) / 2;
              const prevH = (pt.uniquePreviews / maxUse) * chartH;
              const fullH = (pt.fullRenders / maxUse) * chartH;
              const pdfH = (pt.pdfs / maxUse) * chartH;
              const yPrev = padY + chartH - prevH;
              const yFull = yPrev - fullH;
              const yPdf = yFull - pdfH;
              const isHovered = hoveredUseIdx === idx;

              return (
                <g
                  key={pt.date}
                  onMouseEnter={() => setHoveredUseIdx(idx)}
                  onMouseLeave={() => setHoveredUseIdx(null)}
                  onClick={() => setHoveredUseIdx(idx)}
                  className="cursor-pointer"
                >
                  <title>{`${pt.label}: ${pt.uniquePreviews} partituras em prévia (${pt.totalPreviews} renders), ${pt.fullRenders} completas, ${pt.pdfs} PDFs`}</title>
                  <rect
                    x={padX + idx * barSlot}
                    y={0}
                    width={barSlot}
                    height={svgH}
                    fill={isHovered ? 'rgba(56, 189, 248, 0.08)' : 'transparent'}
                  />
                  {prevH + fullH + pdfH <= 0 ? (
                    <rect
                      x={x}
                      y={padY + chartH - 2}
                      width={barW}
                      height={2}
                      rx={1}
                      fill="#27272a"
                    />
                  ) : (
                    <>
                      {prevH > 0 && (
                        <rect
                          x={x}
                          y={yPrev}
                          width={barW}
                          height={Math.max(2, prevH)}
                          fill="#F59E0B"
                        />
                      )}
                      {fullH > 0 && (
                        <rect
                          x={x}
                          y={yFull}
                          width={barW}
                          height={Math.max(2, fullH)}
                          fill="#10B981"
                        />
                      )}
                      {pdfH > 0 && (
                        <rect
                          x={x}
                          y={yPdf}
                          width={barW}
                          height={Math.max(2, pdfH)}
                          fill="#38BDF8"
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          {dailySeries.length > 0 && (
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono px-2 pt-1">
              <span>{dailySeries[0].label}</span>
              <span>{dailySeries[Math.floor(dailySeries.length / 2)].label}</span>
              <span>{dailySeries[dailySeries.length - 1].label}</span>
            </div>
          )}
        </div>
      </div>

      {/* GRÁFICO 3: FUNIL DE CONVERSÃO & MEIOS DE PAGAMENTO */}
      <div className="p-4 sm:p-5 rounded-2xl bg-studio-900 border border-zinc-800 flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
            <PieChart className="w-4 h-4" />
            <span>Status &amp; Conversão ({totalTx})</span>
          </h3>
          <span className="text-[11px] font-bold text-emerald-400">
            {totalTx > 0
              ? `${Math.round((txCounts.approved / safeTotalTx) * 100)}% pagas`
              : 'Sem dados'}
          </span>
        </div>

        <div className="space-y-2.5 text-xs">
          {(
            [
              {
                label: 'Aprovadas',
                count: txCounts.approved,
                color: 'bg-emerald-500',
                text: 'text-emerald-300',
              },
              {
                label: 'Pendentes (ativas)',
                count: txCounts.pending,
                color: 'bg-amber-400',
                text: 'text-amber-300',
              },
              {
                label: 'Expiradas',
                count: txCounts.expired,
                color: 'bg-zinc-500',
                text: 'text-zinc-300',
              },
              {
                label: 'Recusadas / Estorn.',
                count: txCounts.rejected,
                color: 'bg-red-500',
                text: 'text-red-300',
              },
            ] as const
          ).map((row) => {
            const pct = Math.round((row.count / safeTotalTx) * 100);
            return (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300 font-semibold">{row.label}</span>
                  <span className={`font-mono font-bold ${row.text}`}>
                    {row.count} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-studio-950 overflow-hidden border border-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${row.color}`}
                    style={{ width: `${row.count > 0 ? Math.max(4, pct) : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>Mix Aprovado (Pix vs Cartão):</span>
            <span className="font-mono text-zinc-200 font-bold">
              Pix {txCounts.pixApproved} • Cartão {txCounts.cardApproved}
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-studio-950 overflow-hidden flex border border-zinc-800">
            <div
              className="h-full bg-sky-400"
              style={{
                width: `${
                  txCounts.approved > 0
                    ? (txCounts.pixApproved / approvedTotalMethod) * 100
                    : 50
                }%`,
              }}
            />
            <div
              className="h-full bg-[#D97706]"
              style={{
                width: `${
                  txCounts.approved > 0
                    ? (txCounts.cardApproved / approvedTotalMethod) * 100
                    : 50
                }%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
