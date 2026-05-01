export default function LeaveLegend() {
  return (
    <div className="flex items-center gap-5 text-xs text-muted-foreground py-2 px-1">
      <div className="flex items-center gap-1.5">
        <div className="h-2.5 w-2.5 rounded-sm bg-blue-200 border-l-2 border-l-blue-400" />
        <span>PTO</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-2.5 w-2.5 rounded-sm bg-amber-200 border-l-2 border-l-amber-400" />
        <span>LWOP</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-2.5 w-2.5 rounded-sm bg-violet-200 border-l-2 border-l-violet-400" />
        <span>Birthday</span>
      </div>
      <div className="mx-1 h-3 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        <span>Approved</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-amber-400" />
        <span>Pending</span>
      </div>
    </div>
  );
}
