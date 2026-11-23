import { AuraReport } from "../types";

export type RootStackParamList = {
  Auth: undefined;
  Camera:
    | {
        dailyMode?: boolean;
      }
    | undefined;
  History: undefined;
  AuraReport:
    | {
        report: AuraReport;
        mode?: "scan" | "saved";
        /** Local file URI of the 640px JPEG after a fresh scan (display + upload on save). */
        photoUri?: string;
        /** Storage path in aura-photos (`<user_id>/<report_id>.jpg`) for saved reports. */
        photoPath?: string;
      }
    | undefined;
  DailyAura: undefined;
  RemoteCamera: undefined;
  AuraLab: undefined;
  ProfileSettings: undefined;
};
