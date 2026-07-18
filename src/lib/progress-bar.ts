/**
 * Terminal progress bar for long-running pipelines.
 * Updates in-place with: bar | % | current/total | phase | speed | ETA
 */

const WIDTH = 30;

export class ProgressBar {
  private lastLineLen = 0;
  private startTime: number;
  private total: number;
  private current = 0;

  constructor(total: number, private label?: string) {
    this.total = total;
    this.startTime = performance.now();
  }

  update(current: number, phase?: string) {
    this.current = current;
    const pct = (current / this.total) * 100;
    const filled = Math.round((pct / 100) * WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(WIDTH - filled);
    const elapsed = (performance.now() - this.startTime) / 1000;
    const speed = current / elapsed;
    const remaining = this.total - current;
    const eta = speed > 0 ? remaining / speed : 0;
    const etaStr = eta > 60
      ? `${Math.floor(eta / 60)}m${Math.round(eta % 60)}s`
      : `${Math.round(eta)}s`;

    const parts = [
      `[${bar}]`,
      `${pct.toFixed(1)}%`,
      `${current}/${this.total}`,
    ];
    if (phase) parts.push(phase);
    parts.push(`${Math.round(speed)}/s`);
    parts.push(`ETA ${etaStr}`);
    if (this.label) parts.unshift(this.label);

    const line = parts.join(" | ");
    const pad = Math.max(0, this.lastLineLen - line.length);
    process.stdout.write("\r" + line + " ".repeat(pad));
    this.lastLineLen = line.length;
  }

  finish(message?: string) {
    const elapsed = (performance.now() - this.startTime) / 1000;
    const speed = this.current / elapsed;
    process.stdout.write("\r" + " ".repeat(this.lastLineLen + 2) + "\r");
    const msg = message || `Done: ${this.current} items in ${elapsed.toFixed(1)}s (${Math.round(speed)}/s)`;
    console.log(msg);
  }
}
