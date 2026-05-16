import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getTeamDir } from "./paths.js";
import {
	handleTeamEnvCommand,
	handleTeamIdCommand,
	handleTeamListCommand,
	handleTeamStatusCommand,
} from "./leader-info-commands.js";
import { handleTeamAttachCommand, handleTeamDetachCommand } from "./leader-attach-commands.js";
import {
	handleTeamCleanupCommand,
	handleTeamDelegateCommand,
	handleTeamDoneCommand,
	handleTeamGcCommand,
	handleTeamKillCommand,
	handleTeamPruneCommand,
	handleTeamShutdownCommand,
	handleTeamStopCommand,
	handleTeamStyleCommand,
} from "./leader-lifecycle-commands.js";
import {
	handleTeamBroadcastCommand,
	handleTeamDmCommand,
	handleTeamSendCommand,
	handleTeamSteerCommand,
} from "./leader-messaging-commands.js";
import { handleTeamPlanCommand } from "./leader-plan-commands.js";
import { handleTeamSpawnCommand } from "./leader-spawn-command.js";
import { handleTeamTaskCommand } from "./leader-task-commands.js";
import type { SpawnTeammateFn } from "./spawn-types.js";
import type { TeamConfig } from "./team-config.js";
import type { TeamTask } from "./task-store.js";
import type { TeammateHandle } from "./teammate-rpc.js";
import type { ActivityTracker } from "./activity-tracker.js";
import type { TeamsStyle } from "./teams-style.js";

const TEAM_HELP_TEXT = [
	"╔══════════════════════════════════════════════════════════╗",
	"║  Agent Teams — Parallel Pi processes for teamwork       ║",
	"╚══════════════════════════════════════════════════════════╝",
	"",
	"📌 QUICK START",
	"  /team spawn alice                    # spawn teammate",
	"  /team task add alice: Write a test     # create + assign",
	"  /team status                           # see all progress",
	"  /team done                             # stop all, end run",
	"",
	"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	"  SPAWN (create teammates)",
	"  /team spawn <name> [fresh|branch] [shared|worktree] [plan]",
	"           [--model <provider>/<model>] [--thinking <level>]",
	"",
	"    fresh     — new empty context (default)",
	"    branch    — clone leader session context",
	"    shared    — shared working directory (default)",
	"    worktree  — git worktree isolation (clean branch per agent)",
	"    plan      — plan-required mode (read-only until leader approves)",
	"",
	"    Examples:",
	"      /team spawn bob branch shared      # clone context, shared dir",
	"      /team spawn carol fresh worktree   # clean context, git branch",
	"      /team spawn dave plan              # requires plan approval",
	"      /team spawn eve --model openai/gpt-4.1 --thinking high",
	"",
	"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	"  TASKS (work queue)",
	"  /team task add <text...>              # create unassigned",
	"  /team task add <name>: <text...>      # create + assign",
	"  /team task assign <id> <agent>         # assign existing",
	"  /team task unassign <id>                # remove owner",
	"  /team task list                        # all tasks + status",
	"  /team task show <id>                   # full details + result",
	"  /team task dep add <id> <depId>        # task depends on depId",
	"  /team task dep rm <id> <depId>         # remove dependency",
	"  /team task dep ls <id>                  # show dependency graph",
	"  /team task clear [completed|all]       # delete tasks",
	"  /team task use <taskListId>            # share namespace across sessions",
	"",
	"    Examples:",
	"      /team task add alice: Fix the auth bug",
	"      /team task add bob: Review PR #42",
	"      /team task dep add 2 1              # task 2 blocked by task 1",
	"",
	"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	"  MESSAGING (teammate coordination)",
	"  /team send <name> <msg...>             # mailbox message (next turn)",
	"  /team dm <name> [--urgent] <msg...>    # direct message",
	"  /team broadcast [--urgent] <msg...>    # message all teammates",
	"  /team steer <name> <msg...>           # interrupt active turn",
	"",
	"    urgent  — interrupts even mid-turn (use sparingly)",
	"",
	"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	"  LIFECYCLE (control teammates)",
	"  /team status [name]                    # real-time state (idle/streaming/error)",
	"  /team panel                            # open interactive UI",
	"  /team stop <name> [reason...]         # graceful stop",
	"  /team kill <name>                     # force stop (RPC only)",
	"  /team shutdown [name] [reason...]      # shutdown one or all",
	"  /team done [--force]                   # end run, stop all, hide widget",
	"  /team prune [--all]                    # mark stale workers offline",
	"  /team cleanup [--force]                # clean up team artifacts",
	"",
	"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	"  PLAN APPROVALS (gated execution)",
	"  /team plan approve <name>              # allow implementation",
	"  /team plan reject <name> [feedback]  # send back for revision",
	"",
	"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	"  TEAM MANAGEMENT",
	"  /team id                               # show current team ID",
	"  /team env <name>                      # show teammate environment",
	"  /team attach list                      # list attachable teams",
	"  /team attach <teamId> [--claim]       # attach to another session's team",
	"  /team detach                           # detach from attached team",
	"  /team delegate [on|off]                # restrict leader to coordination only",
	"  /team style                            # show current style",
	"  /team style list                       # available styles",
	"  /team style <name>                    # switch style (normal|soviet|pirate)",
	"  /team style init <name> [extends <base>]  # create custom style",
	"  /team gc [--dry-run] [--force] [--max-age-hours=N]",
	"",
	"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	"  ENVIRONMENT VARIABLES",
	"  PI_TEAMS_STYLE          UI personality: normal | soviet | pirate",
	"  PI_TEAMS_SPAWN_MODE     Spawn backend: rpc (default) | tmux",
	"  PI_TEAMS_AUTO_CLAIM     Auto-claim tasks: 1 (default) | 0",
	"  PI_TEAMS_DEFAULT_AUTO_CLAIM  Override auto-claim default",
	"  PI_TEAMS_ROOT_DIR       Override team directory root",
	"  PI_TEAMS_WORKER         Set to \"1\" in child processes (internal)",
	"  PI_TEAMS_PLAN_REQUIRED  Set to \"1\" for plan mode (internal)",
	"",
	"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	"  TIPS",
	"  • /team spawn with no args shows available names",
	"  • Use /team widget for a live dashboard of all teammates",
	"  • Pre-assign tasks: /team task add <name>: <description>",
	"  • Dependencies block tasks until prerequisites complete",
	"  • Worktree mode gives each teammate a clean git branch",
	"  • Branch context shares memory/history with the leader",
	"",
].join("\n");

export function getTeamHelpText(): string {
	return TEAM_HELP_TEXT;
}

export async function handleTeamCommand(opts: {
	args: string;
	ctx: ExtensionCommandContext;
	teammates: Map<string, TeammateHandle>;
	getTeamConfig: () => TeamConfig | null;
	getTracker: () => ActivityTracker;
	getTasks: () => TeamTask[];
	refreshTasks: () => Promise<void>;
	renderWidget: () => void;
	hideWidget: () => void;
	restoreWidget: () => void;
	getTaskListId: () => string | null;
	setTaskListId: (id: string) => void;
	getActiveTeamId: () => string;
	setActiveTeamId: (teamId: string) => void;
	pendingPlanApprovals: Map<string, { requestId: string; name: string; taskId?: string }>;
	getDelegateMode: () => boolean;
	setDelegateMode: (next: boolean) => void;
	getStyle: () => TeamsStyle;
	setStyle: (next: TeamsStyle) => void;
	spawnTeammate: SpawnTeammateFn;
	openWidget: (ctx: ExtensionCommandContext) => Promise<void>;
	getTeamsExtensionEntryPath: () => string | null;
	shellQuote: (v: string) => string;
	getCurrentCtx: () => ExtensionContext | null;
	stopAllTeammates: (ctx: ExtensionContext, reason: string) => Promise<void>;
}): Promise<void> {
	const {
		args,
		ctx,
		teammates,
		getTeamConfig,
		getTracker,
		getTasks,
		refreshTasks,
		renderWidget,
		hideWidget,
		restoreWidget,
		getTaskListId,
		setTaskListId,
		getActiveTeamId,
		setActiveTeamId,
		pendingPlanApprovals,
		getDelegateMode,
		setDelegateMode,
		getStyle,
		setStyle,
		spawnTeammate,
		openWidget,
		getTeamsExtensionEntryPath,
		shellQuote,
		getCurrentCtx,
		stopAllTeammates,
	} = opts;

	const style = getStyle();
	const activeTeamId = getActiveTeamId();
	const leadName = getTeamConfig()?.leadName ?? "team-lead";
	const taskListId = getTaskListId();

	const parts = args.trim().split(/\s+/).filter((p) => p.length > 0);
	const [sub, ...rest] = parts;
	if (!sub || sub === "help") {
		ctx.ui.notify(getTeamHelpText(), "info");
		return;
	}

	type TeamSubcommandHandler = () => Promise<void>;
	const handlers: Record<string, TeamSubcommandHandler> = {
		list: async () => {
			await handleTeamListCommand({
				ctx,
				teammates,
				getTeamConfig,
				getTracker,
				style,
				refreshTasks,
				renderWidget,
			});
		},

		id: async () => {
			await handleTeamIdCommand({
				ctx,
				teamId: activeTeamId,
				taskListId,
				leadName,
				style,
			});
		},

		env: async () => {
			await handleTeamEnvCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				taskListId,
				leadName,
				style,
				getTeamsExtensionEntryPath,
				shellQuote,
			});
		},

		attach: async () => {
			await handleTeamAttachCommand({
				ctx,
				rest,
				defaultTeamId: ctx.sessionManager.getSessionId(),
				teammates,
				getActiveTeamId,
				setActiveTeamId,
				setStyle,
				setTaskListId,
				refreshTasks,
				renderWidget,
				restoreWidget,
			});
		},

		detach: async () => {
			await handleTeamDetachCommand({
				ctx,
				defaultTeamId: ctx.sessionManager.getSessionId(),
				teammates,
				getActiveTeamId,
				setActiveTeamId,
				setTaskListId,
				refreshTasks,
				renderWidget,
				restoreWidget,
			});
		},

		done: async () => {
			await handleTeamDoneCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				teammates,
				getTeamConfig,
				leadName,
				style,
				stopAllTeammates,
				refreshTasks,
				getTasks,
				hideWidget,
			});
		},

		cleanup: async () => {
			await handleTeamCleanupCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				teammates,
				refreshTasks,
				getTasks,
				renderWidget,
				style,
			});
		},

		gc: async () => {
			await handleTeamGcCommand({ ctx, rest, teamId: activeTeamId });
		},

		prune: async () => {
			await handleTeamPruneCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				teammates,
				getTeamConfig,
				refreshTasks,
				getTasks,
				style,
				renderWidget,
			});
		},

		delegate: async () => {
			await handleTeamDelegateCommand({
				ctx,
				rest,
				getDelegateMode,
				setDelegateMode,
				renderWidget,
			});
		},

		shutdown: async () => {
			await handleTeamShutdownCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				teammates,
				getTeamConfig,
				leadName,
				style,
				getCurrentCtx,
				getActiveTeamId,
				stopAllTeammates,
				refreshTasks,
				getTasks,
				renderWidget,
			});
		},

		spawn: async () => {
			await handleTeamSpawnCommand({ ctx, rest, teammates, style, spawnTeammate });
		},

		status: async () => {
			await handleTeamStatusCommand({
				ctx,
				rest,
				teammates,
				getTeamConfig,
				getTracker,
				teamId: activeTeamId,
				taskListId,
				style,
			});
		},

		style: async () => {
			const teamDir = getTeamDir(activeTeamId);
			await handleTeamStyleCommand({
				ctx,
				rest,
				teamDir,
				getStyle,
				setStyle,
				refreshTasks,
				renderWidget,
			});
		},

		panel: async () => {
			await openWidget(ctx);
		},

		send: async () => {
			await handleTeamSendCommand({
				ctx,
				rest,
				teammates,
				style,
				renderWidget,
			});
		},

		steer: async () => {
			await handleTeamSteerCommand({
				ctx,
				rest,
				teammates,
				style,
				renderWidget,
			});
		},

		stop: async () => {
			await handleTeamStopCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				teammates,
				leadName,
				style,
				refreshTasks,
				getTasks,
				renderWidget,
			});
		},

		kill: async () => {
			await handleTeamKillCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				teammates,
				leadName,
				style,
				taskListId,
				refreshTasks,
				renderWidget,
			});
		},

		dm: async () => {
			await handleTeamDmCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				leadName,
				style,
			});
		},

		broadcast: async () => {
			await handleTeamBroadcastCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				teammates,
				leadName,
				style,
				refreshTasks,
				getTasks,
				getTaskListId,
			});
		},

		task: async () => {
			await handleTeamTaskCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				leadName,
				style,
				getTaskListId,
				setTaskListId,
				getTasks,
				refreshTasks,
				renderWidget,
			});
		},

		plan: async () => {
			await handleTeamPlanCommand({
				ctx,
				rest,
				teamId: activeTeamId,
				leadName,
				style,
				pendingPlanApprovals,
			});
		},
	};

	const normalizedSub = sub === "widget" ? "panel" : sub === "join" ? "attach" : sub;
	const handler = handlers[normalizedSub];
	if (!handler) {
		ctx.ui.notify(`Unknown subcommand: ${sub}`, "error");
		return;
	}
	await handler();
}
