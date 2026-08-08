import type { UnifiedEntityStore } from '../../../store/entity-store';
import type { CrafterAgent } from '../../crafter-agent';
import type { Chronicler } from '../../chronicler';
import type { UserAgent } from '../../user-agent';
import type { SessionState } from '../session-state';
import { t } from '../../../i18n';

interface CommandDeps {
  entityStore: UnifiedEntityStore;
  crafter: CrafterAgent;
  chronicler: Chronicler;
  userAgent?: UserAgent;
  session: SessionState;
}

export class CommandHandler {
  constructor(private deps: CommandDeps) {}

  async handle(cmd: string): Promise<string> {
    const lang = t();
    const parts = cmd.split(/\s+/);
    const verb = parts[0]?.toLowerCase() ?? '';

    switch (verb) {
      case 'help':
        return 'Commands: /look, /inventory, /craft, /status, /quests, /time, /save, /quit, /party [add|remove], /attack <target>\n@agent <id> <msg> — private message to an agent\n/craft list — available recipes\n/craft <recipe_id> — craft an item\n/craft suggest <item1> <item2> — get LLM suggestion';
      case 'look': {
        const locNode = this.deps.entityStore.getByNameAndType(this.deps.session.currentLocation, 'Location');
        if (locNode) {
          const desc = (locNode.profile.l2.description as string) ?? lang.youSee;
          return `You look around. ${desc}`;
        }
        return lang.youSeeNothing;
      }
      case 'inventory': {
        if (!this.deps.session.activeCharacter) return lang.noCharacter;
        const inv = this.deps.crafter.scanInventory(this.deps.session.activeCharacter);
        if (inv.size === 0) return lang.crafterInventoryEmpty;
        const lines = ['Inventory:'];
        for (const [name, count] of inv) {
          lines.push(`  ${count > 1 ? `${count}x ` : ''}${name}`);
        }
        const craftable = this.deps.crafter.findCraftable(inv);
        if (craftable.length > 0) {
          lines.push('\nCan craft:');
          for (const r of craftable) {
            lines.push(`  ${r.name} (${r.nameRu}): ${r.ingredients.join(' + ')}`);
          }
        }
        return lines.join('\n');
      }
      case 'craft': {
        if (!this.deps.session.activeCharacter) return lang.noCharacter;
        const subcommand = parts[1]?.toLowerCase() ?? '';

        if (subcommand === 'list') {
          const recipes = this.deps.crafter.getRecipes();
          if (recipes.length === 0) return 'No recipes known.';
          const inv = this.deps.crafter.scanInventory(this.deps.session.activeCharacter);
          const lines = ['Known recipes:'];
          for (const r of recipes) {
            const canCraft = this.deps.crafter.findCraftable(inv).some(cr => cr.id === r.id);
            const mark = canCraft ? ' ✓' : '';
            lines.push(`  ${r.id}: ${r.name} (${r.nameRu}): ${r.ingredients.join(' + ')} → ${r.result} [${r.difficulty}]${mark}`);
          }
          lines.push('\n/craft <recipe_id> to craft | /craft suggest <item1> <item2> for ideas');
          return lines.join('\n');
        }

        if (subcommand === 'suggest') {
          const item1 = parts[2] ?? '';
          const item2 = parts[3] ?? '';
          if (!item1 || !item2) return lang.crafterSuggestion('item1', 'item2');
          const worldRules = this.deps.entityStore.allNodes()
            .filter(n => n.entityType === 'WorldRule')
            .map(n => n.profile.summary)
            .join('; ');
          const suggestion = await this.deps.crafter.suggestRecipe(item1, item2, worldRules);
          return suggestion;
        }

        if (subcommand) {
          const result = this.deps.crafter.craft(subcommand, this.deps.session.activeCharacter);
          if (result.success) {
            await this.deps.chronicler.logEvent(
              `${this.deps.session.activeCharacter} crafted ${result.result}`,
              this.deps.session.currentTime,
              'crafting',
            );
            return lang.crafterCrafted(result.result ?? subcommand, subcommand);
          }
          return result.message;
        }

        const inv = this.deps.crafter.scanInventory(this.deps.session.activeCharacter);
        const craftable = this.deps.crafter.findCraftable(inv);
        const almost = this.deps.crafter.findAlmostCraftable(inv);
        const lines: string[] = [];

        if (craftable.length > 0) {
          lines.push('Can craft now:');
          for (const r of craftable) {
            lines.push(`  ${r.id}: ${r.name} (${r.nameRu}): ${r.ingredients.join(' + ')} → ${r.result}`);
          }
        }

        if (almost.length > 0) {
          lines.push('\nAlmost ready (need 1 more ingredient):');
          for (const { recipe, missing } of almost) {
            lines.push(`  ${recipe.id}: ${recipe.name} — need: ${missing.join(', ')}`);
          }
        }

        if (craftable.length === 0 && almost.length === 0) {
          return lang.crafterNothingToCraft;
        }

        lines.push('\n/craft <recipe_id> to craft');
        return lines.join('\n');
      }
      case 'status':
        return `Location: ${this.deps.session.currentLocation}\nCharacter: ${this.deps.session.activeCharacter ?? 'none'}\nTime: ${this.deps.session.currentTime.toISOString()}`;
      case 'quests':
        return lang.noQuests;
      case 'time':
        return `Story time: ${this.deps.session.currentTime.toISOString()}`;
      case 'save':
        return lang.sessionSaved;
      case 'quit':
        return lang.goodbye;
      case 'party': {
        if (!this.deps.userAgent) return 'Party system not available.';
        const subcmd = parts.slice(1);
        return this.deps.userAgent.handlePartyCommand(subcmd);
      }
      case 'attack': {
        if (!this.deps.userAgent) return 'Attack system not available.';
        const target = parts[1];
        if (!target) return 'Usage: /attack <target>';
        return this.deps.userAgent.handleAttack(
          target,
          this.deps.session.activeCharacter,
          this.deps.session.currentLocation,
          this.deps.session.currentTime,
        );
      }
      default:
        return lang.unknownCommand(verb);
    }
  }
}
