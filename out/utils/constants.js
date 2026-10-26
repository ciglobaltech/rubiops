"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMANDS = exports.SECRET_KEYS = exports.EXTENSION_ID = void 0;
exports.EXTENSION_ID = 'devopsQuickUpdate';
exports.SECRET_KEYS = {
    PAT: 'devopsQuickUpdate.pat',
    CURSOR_API_KEY: 'devopsQuickUpdate.cursorApiKey',
};
exports.COMMANDS = {
    CONNECT: `${exports.EXTENSION_ID}.connect`,
    REFRESH: `${exports.EXTENSION_ID}.refresh`,
    START_WORK: `${exports.EXTENSION_ID}.startWork`,
    COMPLETE: `${exports.EXTENSION_ID}.complete`,
    BLOCKED: `${exports.EXTENSION_ID}.blocked`,
    CHANGE_STATE: `${exports.EXTENSION_ID}.changeState`,
    OPEN_DASHBOARD: `${exports.EXTENSION_ID}.openDashboard`,
    OPEN_AGENT: `${exports.EXTENSION_ID}.openAgent`,
    OPEN_GUIDE: `${exports.EXTENSION_ID}.openGuide`,
    CODE_REVIEW: `${exports.EXTENSION_ID}.codeReview`,
    MERGE_REVIEW: `${exports.EXTENSION_ID}.mergeReview`,
    OPEN_LAST_REPORT: `${exports.EXTENSION_ID}.openLastReport`,
    OPEN_REFACTOR_PREVIEW: `${exports.EXTENSION_ID}.openRefactorPreview`,
    OPEN_TASKS: `${exports.EXTENSION_ID}.openTasks`,
    FOCUS_TASKS_TREE: `${exports.EXTENSION_ID}.focusTasksTree`,
    OPEN_QUERY: `${exports.EXTENSION_ID}.openQuery`,
    OPEN_TASK_BOT: `${exports.EXTENSION_ID}.openTaskBot`,
    COPY_AI_PROMPT: `${exports.EXTENSION_ID}.copyAiPrompt`,
    OPEN_AI_AGENT: `${exports.EXTENSION_ID}.openAiAgent`,
    OPEN_WORK_ITEM: `${exports.EXTENSION_ID}.openWorkItem`,
    COPY_STANDUP: `${exports.EXTENSION_ID}.copyStandup`,
    SHOW_TOKEN_BUDGET: `${exports.EXTENSION_ID}.showTokenBudget`,
    COPY_COMMIT_MESSAGE: `${exports.EXTENSION_ID}.copyCommitMessage`,
    OPEN_RECOMMENDED: `${exports.EXTENSION_ID}.openRecommended`,
    OPEN_BRANCH_WORK_ITEM: `${exports.EXTENSION_ID}.openBranchWorkItem`,
    CONNECT_HUB: `${exports.EXTENSION_ID}.connectHub`,
    DISCONNECT_HUB: `${exports.EXTENSION_ID}.disconnectHub`,
    RUN_BUG_WATCH: `${exports.EXTENSION_ID}.runBugWatch`,
    VERIFY_BROKEN_ISSUE: `${exports.EXTENSION_ID}.verifyBrokenIssue`,
    BUILD_BUG_WORK_PLAN: `${exports.EXTENSION_ID}.buildBugWorkPlan`,
    AUTO_CODE_FIX: `${exports.EXTENSION_ID}.autoCodeFix`,
    SET_CURSOR_API_KEY: `${exports.EXTENSION_ID}.setCursorApiKey`,
    CONNECT_PROJECT_CODE: `${exports.EXTENSION_ID}.connectProjectCode`,
    WHY_DELAYED: `${exports.EXTENSION_ID}.whyDelayed`,
    TODAY_QUEUE: `${exports.EXTENSION_ID}.todayQueue`,
    GENERATE_TESTS: `${exports.EXTENSION_ID}.generateTests`,
    DEVELOPER_CHECKLIST: `${exports.EXTENSION_ID}.developerChecklist`,
    RUN_TEST_COMMANDER: `${exports.EXTENSION_ID}.runTestCommander`,
};
//# sourceMappingURL=constants.js.map