export interface UpdateSharingPolicy {
  scope: 'off' | 'own' | 'everyone';
  /** Zero means unlimited. */
  uploadKibPerSecond: number;
  unmeteredOnly: boolean;
  prepareAndroid: boolean;
}
