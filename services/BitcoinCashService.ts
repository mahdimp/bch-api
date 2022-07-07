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
    console.log(`balance: ${JSON.stringify(balance, null, 2)}`);
    console.log(`Balance of sending address ${SEND_ADDR} is ${balance} BCH.`);

    if (balance <= 0.0) {
      throw "Balance of sending address is zero.";
    }

    if (RECV_ADDR === "") RECV_ADDR = SEND_ADDR;

    const SEND_ADDR_LEGACY = bchjs.Address.toLegacyAddress(SEND_ADDR);
    const RECV_ADDR_LEGACY = bchjs.Address.toLegacyAddress(RECV_ADDR);
    console.log(`Sender Legacy Address: ${SEND_ADDR_LEGACY}`);
    console.log(`Receiver Legacy Address: ${RECV_ADDR_LEGACY}`);

    const utxos = await bchjs.Electrumx.utxo(SEND_ADDR);

    if (utxos.utxos.length === 0) throw new Error("No UTXOs found.");

    const transactionBuilder = new bchjs.TransactionBuilder();
    let originalAmount = 0;
    let i = 0;
    const remainder = 0;

    // iterate over utxos and
    for (let utxo of utxos.utxos) {
      const vout = utxo.tx_pos;
      const txid = utxo.tx_hash;
      transactionBuilder.addInput(txid, vout);
      console.log("utxo.value", utxo.value);
      originalAmount += utxo.value;
    }

    // get fee
    const txFee = this.getTxFee(utxos.utxos.length, 1);
    const satoshisToSend = originalAmount - txFee;
    console.log("utxos.utxos.length", utxos.utxos.length);
    console.log("txFee", txFee);
    console.log("txFee", satoshisToSend);
    transactionBuilder.addOutput(RECV_ADDR, satoshisToSend);

    // sign utxo
    for (let utxoIndex in utxos.utxos) {
      console.log("utxoIndex", utxoIndex);
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
    console.log("hex", hex);
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
    console.log(`balance: ${JSON.stringify(balance, null, 2)}`);
    console.log(`Balance of sending address ${SEND_ADDR} is ${balance} BCH.`);

    if (balance <= 0.0) {
      throw "Balance of sending address is zero.";
    }

    if (RECV_ADDR === "") RECV_ADDR = SEND_ADDR;

    const SEND_ADDR_LEGACY = bchjs.Address.toLegacyAddress(SEND_ADDR);
    const RECV_ADDR_LEGACY = bchjs.Address.toLegacyAddress(RECV_ADDR);
    console.log(`Sender Legacy Address: ${SEND_ADDR_LEGACY}`);
    console.log(`Receiver Legacy Address: ${RECV_ADDR_LEGACY}`);

    const utxos = await bchjs.Electrumx.utxo(SEND_ADDR);

    if (utxos.utxos.length === 0) throw new Error("No UTXOs found.");

    const utxo = await bchjs.Utxo.findBiggestUtxo(utxos.utxos);

    const transactionBuilder = new bchjs.TransactionBuilder();

    const satoshisToSend = bchjs.BitcoinCash.toSatoshi(amount);
    const originalAmount = utxo.value;
    const vout = utxo.tx_pos;
    const txid = utxo.tx_hash;

    transactionBuilder.addInput(txid, vout);

    const txFee = this.getTxFee();
    console.log(`Transaction fee: ${txFee}`);

    const remainder = originalAmount - satoshisToSend - txFee;

    console.log("satoshisToSend", satoshisToSend);
    console.log("originalAmount", originalAmount);
    console.log("txFee", txFee);
    console.log("remainder", remainder);

    if (remainder < 0) {
      throw new Error("Not enough BCH to complete transaction!");
    }

    transactionBuilder.addOutput(RECV_ADDR, satoshisToSend);
    transactionBuilder.addOutput(SEND_ADDR, remainder);

    let wif = secret;
    let ecpair = bchjs.ECPair.fromWIF(wif);
    const keyPair = ecpair;

    let redeemScript;
    transactionBuilder.sign(
      0,
      keyPair,
      redeemScript,
      transactionBuilder.hashTypes.SIGHASH_ALL,
      originalAmount
  );

    const tx = transactionBuilder.build();
    const hex = tx.toHex();
    console.log("hex", hex);
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
    console.log(txidStr);
    return {
      result: txidStr[0],
    };
  }

  async getBalance(addr: string, verbose:boolean) {
    try {
      const result = await bchjs.Electrumx.balance(addr);
      const satBalance =
        Number(result.balance.confirmed) + Number(result.balance.unconfirmed);

      const bchBalance = bchjs.BitcoinCash.toBitcoinCash(satBalance);

      return bchBalance;
    } catch (err) {
      console.error("Error in getBCHBalance: ", err);
      console.log(`addr: ${addr}`);
      throw err;
    }
  }

  getTxFee(inputsCount = 1, outputsCount = 2): number {
    const byteCount = bchjs.BitcoinCash.getByteCount(
      { P2PKH: inputsCount },
      { P2PKH: outputsCount }
    );
    console.log(`Transaction byte count: ${byteCount}`);
    const satoshisPerByte = 1.2;
    return Math.floor(satoshisPerByte * byteCount);
  }
}
