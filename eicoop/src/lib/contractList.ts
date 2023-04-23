import { sha256 } from 'js-sha256';

import { ei, decodeMessage } from 'lib';
import contractProtos from './contracts.json';
import { ContractType } from './contract';

const ORIGINAL_CONTRACT_VALID_DURATION = 21 * 86400;
const LEGGACY_CONTRACT_VALID_DURATION = 7 * 86400;

export const rawContractListHash = sha256(JSON.stringify(contractProtos.map(c => c.id)));

export const rawContractList = contractProtos.map(
  c => decodeMessage(ei.Contract, c.proto) as ei.IContract
);

type maxGoals = {
  aaa: number,
  aa?:  number,
  a?:   number,
  b?:   number,
  c?:   number,
};

export interface Contract extends ei.IContract {
  id: string;
  uniqueKey: string;
  type: ContractType;
  numLeggacies: number;
  offeringTime: number;
  prophecyEggs: number;
  aaaGoal: number,
  aaGoal?: number,
  aGoal?:  number,
  bGoal?:  number,
  cGoal?:  number,
}

export class SortedContractList extends Array<Contract> {
  private rawList: ei.IContract[];

  constructor(rawList: ei.IContract[]) {
    rawList ||= []; // Allow constructor to be called with undefined (happens with vuex)
    super(...annotateAndSortContracts(rawList));
    this.rawList = rawList;
  }

  static get [Symbol.species](): ArrayConstructor {
    return Array;
  }

  add(raw: ei.IContract): void {
    if (this.get(raw.identifier!, raw.expirationTime!)) {
      // Do not add if an instance already exists.
      return;
    }
    this.rawList.push(raw);
    const newSortedList = annotateAndSortContracts(this.rawList);
    this.length = 0;
    this.push(...newSortedList);
  }

  deduplicated(): Contract[] {
    const seen = new Set<string>();
    const deduped: Contract[] = [];
    for (let i = this.length - 1; i >= 0; i--) {
      const contract = this[i];
      if (seen.has(contract.id)) {
        continue;
      }
      deduped.push(contract);
      seen.add(contract.id);
    }
    return deduped.reverse();
  }

  /**
   * Returns the contract with a matching id and expiration timestamp, if any.
   * Expiration timestamps are considered matching if within 30 days of each
   * other.
   * @param contractId
   * @param expirationTime - Epoch seconds.
   * @returns
   */
  get(contractId: string, expirationTime: number): Contract | undefined {
    for (let i = this.length - 1; i >= 0; i--) {
      const contract = this[i];
      if (
        contractId === contract.id &&
        Math.abs(expirationTime - contract.expirationTime!) < 30 * 86400
      ) {
        return contract;
      }
    }
    return undefined;
  }

  get latestOriginalProphecyEggContract(): Contract | undefined {
    for (let i = this.length - 1; i >= 0; i--) {
      const contract = this[i];
      if (contract.type === 'Original' && contract.prophecyEggs > 0) {
        return contract;
      }
    }
    return undefined;
  }
}

function toContract(c: ei.IContract): Contract {
  const goals = getGoals(c);
  return {
      ...c,
      id: c.identifier!,
      uniqueKey: `${c.identifier}-${c.expirationTime}`,
      type: 'Original',
      numLeggacies: 0,
      offeringTime: c.startTime ?? 0,
      prophecyEggs: getProphecyEggsCount(c),
      aaaGoal: goals.aaa,
      aaGoal: goals.aa,
      aGoal: goals.a,
      bGoal: goals.b,
      cGoal: goals.c,
    }
}

function annotateAndSortContracts(rawList: ei.IContract[]): Contract[] {
  const list: Contract[] = [...rawList]
    .sort((c1, c2) => c1.expirationTime! - c2.expirationTime!)
    .map(toContract);
  const count = new Map<string, number>();
  for (const contract of list) {
    if (count.has(contract.id)) {
      contract.type = 'Leggacy';
      contract.offeringTime ||= contract.expirationTime! - LEGGACY_CONTRACT_VALID_DURATION;
      count.set(contract.id, count.get(contract.id)! + 1);
    } else {
      contract.type = 'Original';
      contract.offeringTime ||= contract.expirationTime! - ORIGINAL_CONTRACT_VALID_DURATION;
      count.set(contract.id, 1);
    }
  }
  for (const contract of list) {
    contract.numLeggacies = count.get(contract.id)! - 1;
  }
  return list.sort((c1, c2) => c1.offeringTime - c2.offeringTime);
}

function getProphecyEggsCount(contract: ei.IContract) {
  let count = 0;
  for (const goal of contract.goals!) {
    if (goal.rewardType === ei.RewardType.EGGS_OF_PROPHECY) {
      count += goal.rewardAmount!;
    }
  }
  return count;
}

function getGoals(contract: ei.IContract): maxGoals {
  if (contract.gradeSpecs || contract.goalSets) {
    const goals = getGradeLeageGoals(contract);
    return { aaa: goals[0], aa: goals[1], a: goals[2], b: goals[3], c: goals[4]};
  }
  const goals = contract.goals!;
  return { aaa: goals[goals.length - 1].targetAmount! };


}
// get final goal from some object with a goals[]
function getGradeLeageGoals(contract: ei.IContract) {
  const goalsWrapper = contract.gradeSpecs ?? contract.goalSets;
  return goalsWrapper!.map( (goalWrapper) =>
    goalWrapper.goals![goalWrapper.goals!.length - 1].targetAmount!
  );
}

function getEliteGoal(contract: ei.IContract) {
  if (!contract.gradeSpecs) {
    const goals = contract.goals!;
    return goals[goals.length - 1].targetAmount!;
  }
  const goals = contract.gradeSpecs[1].goals!;
  return goals[goals.length - 1].targetAmount!;
}

function getStandardGoal(contract: ei.IContract) {
  if (!contract.goalSets) {
    return 0;
  }
  const goals = contract.goalSets[1].goals!;
  return goals[goals.length - 1].targetAmount!;
}
