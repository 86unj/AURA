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
      }
    | undefined;
  DailyAura: undefined;
  RemoteCamera: undefined;
  AuraLab: undefined;
};
