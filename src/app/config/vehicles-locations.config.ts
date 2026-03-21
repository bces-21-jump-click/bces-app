export interface VehicleLocation {
  value: string;
  text: string;
  home: boolean;
}

export const VEHICLES_LOCATIONS: VehicleLocation[] = [
  { value: 'garage', text: '🏥 Garage BCES', home: true },
  { value: 'heliport', text: '🚁 Héliport BCES', home: true },
  { value: 'fouriere', text: '⛔ Fourrière', home: false },
];
