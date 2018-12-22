/* global describe, it */

var assert = require('assert')
var ravencoin = require('../../')
var blockchain = require('./_blockchain')

var network = ravencoin.networks.testnet
var alice = ravencoin.ECPair.fromWIF('cScfkGjbzzoeewVWmU2hYPUHeVGJRDdFt7WhmrVVGkxpmPP8BHWe', network)
var bob = ravencoin.ECPair.fromWIF('cMkopUXKWsEzAjfa1zApksGRwjVpJRB3831qM9W4gKZsLwjHXA9x', network)

describe('ravencoinjs-lib (CLTV)', function () {
  var hashType = ravencoin.Transaction.SIGHASH_ALL

  function cltvCheckSigOutput (aQ, bQ, utcSeconds) {
    return ravencoin.script.compile([
      ravencoin.opcodes.OP_IF,
      ravencoin.script.number.encode(utcSeconds),
      ravencoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      ravencoin.opcodes.OP_DROP,

      ravencoin.opcodes.OP_ELSE,
      bQ.getPublicKeyBuffer(),
      ravencoin.opcodes.OP_CHECKSIGVERIFY,
      ravencoin.opcodes.OP_ENDIF,

      aQ.getPublicKeyBuffer(),
      ravencoin.opcodes.OP_CHECKSIG
    ])
  }

  function utcNow () {
    return Math.floor(Date.now() / 1000)
  }

  // expiry past, {Alice's signature} OP_TRUE
  it('where Alice can redeem after the expiry is past', function (done) {
    this.timeout(30000)

    // three hours ago
    var timeUtc = utcNow() - (3600 * 3)
    var redeemScript = cltvCheckSigOutput(alice, bob, timeUtc)
    var scriptPubKey = ravencoin.script.scriptHash.output.encode(ravencoin.crypto.hash160(redeemScript))
    var address = ravencoin.address.fromOutputScript(scriptPubKey, network)

    // fund the P2SH(CLTV) address
    blockchain.t.faucet(address, 2e4, function (err, unspent) {
      if (err) return done(err)

      var tx = new ravencoin.TransactionBuilder(network)
      tx.setLockTime(timeUtc)
      tx.addInput(unspent.txId, 0, 0xfffffffe)
      tx.addOutput(blockchain.t.RETURN, 1e4)

      var txRaw = tx.buildIncomplete()
      var signatureHash = txRaw.hashForSignature(0, redeemScript, hashType)

      // {Alice's signature} OP_TRUE
      var redeemScriptSig = ravencoin.script.scriptHash.input.encode([
        alice.sign(signatureHash).toScriptSignature(hashType),
        ravencoin.opcodes.OP_TRUE
      ], redeemScript)

      txRaw.setInputScript(0, redeemScriptSig)

      blockchain.t.transactions.propagate(txRaw.toHex(), done)
    })
  })

  // expiry ignored, {Bob's signature} {Alice's signature} OP_FALSE
  it('where Alice and Bob can redeem at any time', function (done) {
    this.timeout(30000)

    // two hours ago
    var timeUtc = utcNow() - (3600 * 2)
    var redeemScript = cltvCheckSigOutput(alice, bob, timeUtc)
    var scriptPubKey = ravencoin.script.scriptHash.output.encode(ravencoin.crypto.hash160(redeemScript))
    var address = ravencoin.address.fromOutputScript(scriptPubKey, network)

    // fund the P2SH(CLTV) address
    blockchain.t.faucet(address, 2e4, function (err, unspent) {
      if (err) return done(err)

      var tx = new ravencoin.TransactionBuilder(network)
      tx.addInput(unspent.txId, 0, 0xfffffffe)
      tx.addOutput(blockchain.t.RETURN, 1e4)

      var txRaw = tx.buildIncomplete()
      var signatureHash = txRaw.hashForSignature(0, redeemScript, hashType)
      var redeemScriptSig = ravencoin.script.scriptHash.input.encode([
        alice.sign(signatureHash).toScriptSignature(hashType),
        bob.sign(signatureHash).toScriptSignature(hashType),
        ravencoin.opcodes.OP_FALSE
      ], redeemScript)

      txRaw.setInputScript(0, redeemScriptSig)

      blockchain.t.transactions.propagate(txRaw.toHex(), done)
    })
  })

  // expiry in the future, {Alice's signature} OP_TRUE
  it('fails when still time-locked', function (done) {
    this.timeout(30000)

    // two hours from now
    var timeUtc = utcNow() + (3600 * 2)
    var redeemScript = cltvCheckSigOutput(alice, bob, timeUtc)
    var scriptPubKey = ravencoin.script.scriptHash.output.encode(ravencoin.crypto.hash160(redeemScript))
    var address = ravencoin.address.fromOutputScript(scriptPubKey, network)

    // fund the P2SH(CLTV) address
    blockchain.t.faucet(address, 2e4, function (err, unspent) {
      if (err) return done(err)

      var tx = new ravencoin.TransactionBuilder(network)
      tx.setLockTime(timeUtc)
      tx.addInput(unspent.txId, 0, 0xfffffffe)
      tx.addOutput(blockchain.t.RETURN, 1e4)

      var txRaw = tx.buildIncomplete()
      var signatureHash = txRaw.hashForSignature(0, redeemScript, hashType)

      // {Alice's signature} OP_TRUE
      var redeemScriptSig = ravencoin.script.scriptHash.input.encode([
        alice.sign(signatureHash).toScriptSignature(hashType),
        ravencoin.opcodes.OP_TRUE
      ], redeemScript)

      txRaw.setInputScript(0, redeemScriptSig)

      blockchain.t.transactions.propagate(txRaw.toHex(), function (err) {
        assert.throws(function () {
          if (err) throw err
        }, /Error: 64: non-final/)

        done()
      })
    })
  })
})
