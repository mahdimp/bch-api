const BCHN_MAINNET = "https://bchn.fullstack.cash/v5/";
const BCHJS = require("@psf/bch-js");
const bchjs = new BCHJS({ restURL: BCHN_MAINNET });
const { default: axios } = require("axios");

export class BitcoinCashService {
  async createRawTxForAllUtxos({
    to,
    from,
    secret,
  }: {
    to: string;
    from: string;
    secret: string;
  }) {
    let RECV_ADDR = `${to}`;
    const SEND_ADDR = `${from}`;
    const balance = await this.getBalance(SEND_ADDR, false);

    if (balance <= 0.0) {
      throw "Balance of sending address is zero.";
    }

    if (RECV_ADDR === "") RECV_ADDR = SEND_ADDR;

    const utxos = await bchjs.Electrumx.utxo(SEND_ADDR);

    if (utxos.utxos.length === 0) throw new Error("No UTXOs found.");

    const transactionBuilder = new bchjs.TransactionBuilder();
    let originalAmount = 0;
    let i = 0;

    for (let utxo of utxos.utxos) {
      const vout = utxo.tx_pos;
      const txid = utxo.tx_hash;
      transactionBuilder.addInput(txid, vout);
      originalAmount += utxo.value;
    }

    const txFee = this.getTxFee(utxos.utxos.length, 1);
    const satoshisToSend = originalAmount - txFee;
    transactionBuilder.addOutput(RECV_ADDR, satoshisToSend);

    for (let utxoIndex in utxos.utxos) {
      const utxo = utxos.utxos[utxoIndex];
      let wif = secret;
      let ecpair = bchjs.ECPair.fromWIF(wif);
      const keyPair = ecpair;
      let redeemScript;
      transactionBuilder.sign(
        +utxoIndex,
        keyPair,
        redeemScript,
        transactionBuilder.hashTypes.SIGHASH_ALL,
        utxo.value
      );
    }

    const tx = transactionBuilder.build();
    const hex = tx.toHex();
    return hex;
  }

  async createRawTx({
    to,
    from,
    secret,
    amount,
  }: {
    to: string;
    from: string;
    secret: string;
    amount: string;
  }) {
    let RECV_ADDR = `${to}`;
    const SEND_ADDR = `${from}`;

    const balance = await this.getBalance(SEND_ADDR, false);

    if (balance <= 0.0) {
      throw "Balance of sending address is zero.";
    }

    if (RECV_ADDR === "") RECV_ADDR = SEND_ADDR;

    const utxos = await bchjs.Electrumx.utxo(SEND_ADDR);

    if (utxos.utxos.length === 0) throw new Error("No UTXOs found.");
    let originalAmount = 0;

    const satoshisToSend = bchjs.BitcoinCash.toSatoshi(amount);
    const transactionBuilder = new bchjs.TransactionBuilder();

    let inputsCount = 0;
    for (let utxo of utxos.utxos) {
      const vout = utxo.tx_pos;
      const txid = utxo.tx_hash;
      transactionBuilder.addInput(txid, vout);
      originalAmount += utxo.value;
      inputsCount += 1;
      const tempTxFee = this.getTxFee(inputsCount, 2);
      if (originalAmount + tempTxFee > satoshisToSend) {
        break;
      }
    }

    const txFee = this.getTxFee(inputsCount, 2);
    const remainder = originalAmount - satoshisToSend - txFee;

    if (remainder < 0) {
      throw new Error("Not enough BCH to complete transaction!");
    }

    transactionBuilder.addOutput(RECV_ADDR, satoshisToSend);
    transactionBuilder.addOutput(SEND_ADDR, remainder);

    for (let utxoIndex = 0; utxoIndex < inputsCount; utxoIndex++) {
      const utxo = utxos.utxos[utxoIndex];
      let wif = secret;
      let ecpair = bchjs.ECPair.fromWIF(wif);
      const keyPair = ecpair;
      let redeemScript;
      transactionBuilder.sign(
        +utxoIndex,
        keyPair,
        redeemScript,
        transactionBuilder.hashTypes.SIGHASH_ALL,
        utxo.value
      );
    }

    const tx = transactionBuilder.build();
    const hex = tx.toHex();
    return hex;
  }

  async sendTransaction({
    to,
    from,
    secret,
    amount,
  }: {
    to: string;
    from: string;
    secret: string;
    amount?: string;
  }) {
    let hex: string;

    if (amount) {
      hex = await this.createRawTx({
        to,
        from,
        secret,
        amount,
      });
    } else {
      hex = await this.createRawTxForAllUtxos({
        to,
        from,
        secret,
      });
    }

    const txidStr = await bchjs.RawTransactions.sendRawTransaction([hex]);
    return {
      result: txidStr[0],
    };
  }

  async getBalance(addr: string, verbose: boolean) {
    try {
      const result = await bchjs.Electrumx.balance(addr);
      const satBalance =
        Number(result.balance.confirmed) + Number(result.balance.unconfirmed);

      const bchBalance = bchjs.BitcoinCash.toBitcoinCash(satBalance);

      return bchBalance;
    } catch (err) {
      console.error("Error in getBCHBalance: ", err);
      throw err;
    }
  }

  getTxFee(inputsCount = 1, outputsCount = 2): number {
    const byteCount = bchjs.BitcoinCash.getByteCount(
      { P2PKH: inputsCount },
      { P2PKH: outputsCount }
    );
    const satoshisPerByte = 1.2;
    return Math.floor(satoshisPerByte * byteCount);
  }
}
