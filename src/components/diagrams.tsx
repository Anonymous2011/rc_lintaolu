import type { Dictionary } from "@/lib/i18n";

type Labels = Dictionary["overview"];

/**
 * Diagrams are inline SVG rather than a chart library: they are fixed drawings,
 * not data, and shipping a renderer for eight boxes would be worse than the
 * boxes. Strokes use currentColor so both themes work without a second palette.
 */

const boxFill = "fill-white";
const boxStroke = "stroke-zinc-400";
const line = "stroke-zinc-500";
const textMain = "fill-zinc-800";
const textMuted = "fill-zinc-600";

function Box({
  x,
  y,
  w,
  h,
  label,
  sub,
  accent,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        className={`${accent ?? boxFill} ${boxStroke}`}
        strokeWidth={1}
      />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 3 : y + h / 2 + 4}
        textAnchor="middle"
        className={`${textMain} text-[13px] font-medium`}
      >
        {label}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 13}
          textAnchor="middle"
          className={`${textMuted} text-[11px]`}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  label,
  dashed,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  dashed?: boolean;
}) {
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        className={line}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "4 3" : undefined}
        markerEnd="url(#arrowhead)"
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={y1 === y2 ? y1 - 7 : (y1 + y2) / 2 - 6}
          textAnchor="middle"
          className={`${textMuted} text-[11px]`}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Defs() {
  return (
    <defs>
      <marker
        id="arrowhead"
        markerWidth="7"
        markerHeight="7"
        refX="6"
        refY="2.5"
        orient="auto"
      >
        <path d="M0,0 L6,2.5 L0,5 z" className="fill-zinc-500" />
      </marker>
    </defs>
  );
}

export function ArchitectureDiagram({ t }: { t: Labels }) {
  const a = t.archLabels;
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 880 330" className="h-auto w-full min-w-[680px]" role="img">
        <Defs />

        {/* Business systems */}
        <text x={20} y={26} className={`${textMuted} text-[11px] font-medium`}>
          {a.business}
        </text>
        <Box x={20} y={38} w={130} h={40} label={a.sys1} />
        <Box x={20} y={88} w={130} h={40} label={a.sys2} />
        <Box x={20} y={138} w={130} h={40} label={a.sys3} />

        <Arrow x1={155} y1={108} x2={255} y2={108} label={a.accept} />
        <text x={205} y={124} textAnchor="middle" className={`${textMuted} text-[11px]`}>
          {a.acceptSub}
        </text>

        {/* The relay itself */}
        <rect
          x={260}
          y={20}
          width={330}
          height={290}
          rx={8}
          className="fill-zinc-100 stroke-zinc-400"
          strokeWidth={1}
          strokeDasharray="5 4"
        />
        <text x={272} y={38} className={`${textMuted} text-[11px] font-medium`}>
          {a.relay}
        </text>

        <Box x={285} y={50} w={190} h={44} label={a.ingress} sub={a.ingressSub} />
        <Arrow x1={380} y1={98} x2={380} y2={126} label={a.persist} />
        <Box
          x={285}
          y={130}
          w={190}
          h={44}
          label={a.queue}
          sub={a.queueSub}
          accent="fill-amber-500/10"
        />
        <Arrow x1={380} y1={178} x2={380} y2={206} label={a.claim} />
        <Box x={285} y={210} w={190} h={44} label={a.worker} sub={a.workerSub} />

        {/* Retry loop back into the queue */}
        <path
          d="M485,232 C540,232 540,152 485,152"
          fill="none"
          className={line}
          strokeWidth={1.5}
          markerEnd="url(#arrowhead)"
        />
        <text x={556} y={196} textAnchor="middle" className={`${textMuted} text-[11px]`}>
          {a.retry}
        </text>

        <Arrow x1={478} y1={232} x2={700} y2={232} label={a.deliver} />

        {/* Vendors */}
        <text x={700} y={26} className={`${textMuted} text-[11px] font-medium`}>
          {a.vendors}
        </text>
        <Box x={700} y={158} w={160} h={40} label={a.vendor1} />
        <Box x={700} y={208} w={160} h={40} label={a.vendor2} />
        <Box x={700} y={258} w={160} h={40} label={a.vendor3} />

        {/* Monitor reads the same table */}
        <Box x={60} y={244} w={150} h={40} label={a.monitor} />
        <Arrow x1={285} y1={160} x2={215} y2={252} label={a.read} dashed />
      </svg>
    </div>
  );
}
