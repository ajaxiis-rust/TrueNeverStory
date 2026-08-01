import type { WorldCreationProgress } from '../services/world-creation-progress';

export class CLIProgressBar {
  private lastOutput = '';

  format(progress: WorldCreationProgress): string {
    const percentage = progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

    const barLength = 30;
    const filledLength = Math.round(barLength * (percentage / 100));
    const emptyLength = barLength - filledLength;

    const bar = '▓'.repeat(filledLength) + '░'.repeat(emptyLength);

    const stageLabel = this.getStageLabel(progress.stage);
    const pauseIndicator = progress.isPaused ? ' [PAUSED]' : '';

    let output = `[${stageLabel}] ${progress.message}\n`;
    output += `  [${bar}] ${percentage}% (${progress.current}/${progress.total})${pauseIndicator}\n`;

    if (progress.currentArticle) {
      output += `  → Current: ${progress.currentArticle}\n`;
    }

    if (progress.errors.length > 0) {
      output += `  → Errors: ${progress.errors.length}\n`;
    }

    return output;
  }

  print(progress: WorldCreationProgress): void {
    const output = this.format(progress);

    if (this.lastOutput) {
      const lines = this.lastOutput.split('\n').length;
      for (let i = 0; i < lines; i++) {
        process.stdout.write('\x1b[1A\x1b[2K');
      }
    }

    process.stdout.write(output);
    this.lastOutput = output;
  }

  private getStageLabel(stage: string): string {
    switch (stage) {
      case 'generating': return 'Stage 1/3: Generating World';
      case 'researching': return 'Stage 2/3: Wikipedia Research';
      case 'building_rag': return 'Stage 3/3: Building RAG';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      default: return stage;
    }
  }
}
