export type PetDockState = 'disabled' | 'waitingForCodex' | 'waitingForPet'
  | 'active' | 'unavailable' | 'unsupported';

export interface PetDockStatus {
  enabled: boolean;
  showLabels: boolean;
  state: PetDockState;
}

export interface PetDockApi {
  load: () => Promise<PetDockStatus>;
  save: (enabled: boolean) => Promise<PetDockStatus>;
  saveLabels: (showLabels: boolean) => Promise<PetDockStatus>;
}
