export class Duration {
	private readonly _duration: number;

	private constructor(duration: number) {
		this._duration = duration;
	}

	asMilliseconds(): number {
		return this._duration;
	}

	asSeconds(): number {
		return this._duration / 1000;
	}

	asYears(): number {
		return this._duration / 31_557_600_000;
	}

	static between(a: Date, b: Date): Duration {
		return new Duration(Math.abs(a.getTime() - b.getTime()));
	}

	static since(when: Date): Duration {
		return new Duration(Date.now() - when.getTime());
	}

	static days(n: number): Duration {
		return new Duration(n * 86_400_000);
	}

	static hours(n: number): Duration {
		return new Duration(n * 3_600_000);
	}
}
