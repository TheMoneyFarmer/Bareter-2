// Type stubs for @capacitor/haptics — replaced by real types once npm install runs
declare module "@capacitor/haptics" {
  export enum ImpactStyle {
    Heavy = "HEAVY",
    Medium = "MEDIUM",
    Light = "LIGHT",
  }
  export enum NotificationType {
    Success = "SUCCESS",
    Warning = "WARNING",
    Error = "ERROR",
  }
  export namespace Haptics {
    function impact(options: { style: ImpactStyle }): Promise<void>;
    function notification(options: { type: NotificationType }): Promise<void>;
    function vibrate(options?: { duration: number }): Promise<void>;
  }
}
