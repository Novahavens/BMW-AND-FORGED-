/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CarModel } from '../../types';

/** "M4 G82" -> "M4", "X5 M F95" -> "X5 M": the model name without the chassis code. */
export const shortModelName = (car: CarModel) =>
  // drops the chassis code (G87, F92, ...), never an M designation such as the iX3's M60
  car.badge.split(' ').filter((t) => !/^[A-LN-Z]\d{2}$/.test(t)).join(' ') || car.badge;
