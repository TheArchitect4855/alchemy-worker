const earthRadiusKm = 6378;

export default class Location {
	readonly latitude: number;
	readonly longitude: number;

	constructor(latitude: number, longitude: number) {
		this.latitude = latitude;
		this.longitude = longitude;
	}

	distanceToKm(latitude: number, longitude: number): number {
		const dLat = this.d2r(latitude - this.latitude);
		const dLon = this.d2r(longitude - this.longitude);
		const hSinLat = Math.sin(dLat / 2);
		const hSinLon = Math.sin(dLon / 2);
		const a = hSinLat * hSinLat + Math.cos(this.d2r(this.latitude)) * Math.cos(this.d2r(latitude)) * hSinLon * hSinLon;
		const c = Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 2;
		return earthRadiusKm * c;
	}

	toString(): string {
		return `(${this.latitude}, ${this.longitude})`;
	}

	private d2r(d: number): number {
		return d * Math.PI / 180;
	}
}
