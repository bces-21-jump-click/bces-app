export interface VehicleLocation {
  value: string;
  text: string;
  home: boolean;
}

export const VEHICLES_LOCATIONS: VehicleLocation[] = [
  { value: 'garage', text: '🏥 Garage LSES', home: true },
  { value: 'heliport', text: '🚁 Héliport LSES', home: true },
  { value: 'fouriere', text: '⛔ Fourrière', home: false },
];
