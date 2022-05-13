import { AccountId } from '@aztec/barretenberg/account_id';
import { AssetValue } from '@aztec/barretenberg/asset';
import { TxId } from '@aztec/barretenberg/tx_id';
import { CoreSdkInterface } from '../core_sdk';
import { ProofOutput } from '../proofs';
import { Signer } from '../signer';
import { createTxRefNo } from './create_tx_ref_no';
import { filterUndefined } from './filter_undefined';

export class TransferController {
  private proofOutput!: ProofOutput;
  private feeProofOutput?: ProofOutput;
  private txId!: TxId;

  constructor(
    public readonly userId: AccountId,
    private readonly userSigner: Signer,
    public readonly assetValue: AssetValue,
    public readonly fee: AssetValue,
    public readonly to: AccountId,
    private readonly core: CoreSdkInterface,
  ) {
    if (!assetValue.value) {
      throw new Error('Value must be greater than 0.');
    }
  }

  public async createProof() {
    const { assetId, value } = this.assetValue;
    const requireFeePayingTx = this.fee.value && this.fee.assetId !== assetId;
    const privateInput = value + (!requireFeePayingTx ? this.fee.value : BigInt(0));
    const txRefNo = requireFeePayingTx ? createTxRefNo() : 0;
    const spendingPublicKey = this.userSigner.getPublicKey();

    const proofInput = await this.core.createPaymentProofInput(
      this.userId,
      assetId,
      BigInt(0),
      BigInt(0),
      privateInput,
      value,
      BigInt(0),
      this.to,
      undefined,
      spendingPublicKey,
      2,
    );
    proofInput.signature = await this.userSigner.signMessage(proofInput.signingData);
    this.proofOutput = await this.core.createPaymentProof(proofInput, txRefNo);

    if (requireFeePayingTx) {
      const feeProofInput = await this.core.createPaymentProofInput(
        this.userId,
        this.fee.assetId,
        BigInt(0),
        BigInt(0),
        this.fee.value,
        BigInt(0),
        BigInt(0),
        undefined,
        undefined,
        spendingPublicKey,
        2,
      );
      feeProofInput.signature = await this.userSigner.signMessage(feeProofInput.signingData);
      this.feeProofOutput = await this.core.createPaymentProof(feeProofInput, txRefNo);
    }
  }

  async send() {
    if (!this.proofOutput) {
      throw new Error('Call createProof() first.');
    }
    [this.txId] = await this.core.sendProofs(filterUndefined([this.proofOutput, this.feeProofOutput]));
    return this.txId;
  }

  async awaitSettlement(timeout?: number) {
    if (!this.txId) {
      throw new Error(`Call ${!this.proofOutput ? 'createProof()' : 'send()'} first.`);
    }
    await this.core.awaitSettlement(this.txId, timeout);
  }
}
