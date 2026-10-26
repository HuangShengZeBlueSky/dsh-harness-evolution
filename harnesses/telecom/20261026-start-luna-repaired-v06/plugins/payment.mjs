import {installRepair} from '../lib/repair-core.mjs';
export const name='experiment1/payment';
export function apply(ctx){installRepair(ctx,'payment');}
