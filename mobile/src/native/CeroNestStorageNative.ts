// src/native/CeroNestStorageNative.ts

export type DaySnapshot = {
  date: string;
};

type CeroNestNativeType = {
  getDaySnapshot(date: string): Promise<DaySnapshot>;
};

const CeroNestNative: CeroNestNativeType = {
  async getDaySnapshot(date: string) {
    return {date};
  },
};

export default CeroNestNative;