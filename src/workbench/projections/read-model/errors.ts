export class CurrentProjectConversationUnavailableError extends Error {
  constructor() {
    super("Skill-native Workbench snapshot requires a current project Conversation; legacy memory fallback is disabled.");
    this.name = "CurrentProjectConversationUnavailableError";
  }
}
