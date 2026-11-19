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
  AuraCardPreview:
    | {
        /** A real scan to preview. Without it the screen uses sample reports. */
        report?: AuraReport;
        photoUri?: string;
      }
    | undefined;
};
