/**
 * WebRTCTransport - WebRTC Transport for RLPx and DPT, based on js-libp2p-webrtc-star
 */
'use strict'

const { EventEmitter } = require('events')
const SimplePeer = require('simple-peer')
const once = require('once')
const io = require('socket.io-client')
const noop = once(() => {})
const sioOptions = {
  transports: ['websocket'],
  'force new connection': true
}

class WebRTCInitiator extends SimplePeer {
  constructor (options) {
    super(options)
    this._id = options.id
    const sioUrl = 'http://localhost:9090/' // the socket io star server.

    this.io = io.connect(sioUrl, sioOptions)
  }

  connect (peer, callback) {
    callback = callback ? once(callback) : noop
    const intentId = (~~(Math.random() * 1e9)).toString(36) + Date.now()

    // const sioClient = this
    //       .listenersRefs[Object.keys(this.listenersRefs)[0]].io
    const sioClient = this.io

    // const spOptions = { initiator: true, trickle: false }
    //
    // // Use custom WebRTC implementation
    // if (this.wrtc) { spOptions.wrtc = this.wrtc }

    let connected = false
    this.on('signal', (signal) => {
      sioClient.emit('ss-handshake', {
        intentId: intentId,
        fromId: this._id.toString(),
        toId: peer.id.toString(),
        signal: signal
      })
    })

    this.once('timeout', () => callback(new Error('timeout')))

    this.once('error', (err) => {
      if (!connected) { callback(err) }
    })

    sioClient.on('ws-handshake', (offer) => {
      if (offer.intentId === intentId && offer.err) {
        return callback(new Error(offer.err))
      }

      if (offer.intentId !== intentId || !offer.answer) {
        return
      }

      this.once('connect', () => {
        connected = true
        // conn.destroy = channel.destroy.bind(channel)

        // channel.once('close', () => this.emit('close'))

        // conn.getObservedAddrs = (callback) => callback(null, [ma])

        callback(null, this)
      })

      this.signal(offer.signal)
    })

    return this
  }

  end (onclose) {
    this.destroy(onclose)
  }
}

class WebRTCReciever extends EventEmitter {
  constructor (options) {
    super(options)
    this._id = options.id || null
  }

  listen (peer, callback) {
    callback = callback ? once(callback) : noop

    this._id = peer.id
    const sioUrl = 'http://localhost:9090/' // the socket io star server.

    this.io = io.connect(sioUrl, sioOptions)

    this.io.once('connect_error', callback)
    this.io.once('error', (err) => {
      this.emit('error', err)
      this.emit('close')
    })

    this.io.on('ws-handshake', incomingConnction.bind(this))
    this.io.on('ws-peer', this._peerDiscovered)
    this.io.on('connect', () => {
      this.io.emit('ss-join', this._id.toString())
    })

    this.io.once('connect', () => {
      this.emit('listening')
      callback()
    })

    function incomingConnction (offer) {
      if (offer.answer || offer.err) {
        return
      }

      const spOptions = {trickle: false}

      if (this.wrtc) { spOptions.wrtc = this.wrtc }

      const channel = new SimplePeer(spOptions)

      channel.once('connect', () => {
        this.emit('connection', channel)
      })

      channel.once('signal', (signal) => {
        offer.signal = signal
        offer.answer = true
        this.io.emit('ss-handshake', offer)
      })

      channel.signal(offer.signal)
    }
  }

  close (callback) {
    callback = callback ? once(callback) : noop

    this.io.emit('ss-leave')
    setImmediate(() => {
      this.emit('close')
      callback()
    })
  }
}

// class WebRTCTransport extends EventEmitter {
//   constructor (options) {
//     super()
//     this._id = options.id || null
//     this.wrtc = options.wrtc || null
//
//     this.listenersRefs = {}
//   }
//
//   connect (peer, options, callback) {
//     if (typeof options === 'function') {
//       callback = options
//       options = {}
//     }
//
//     callback = callback ? once(callback) : noop
//     const intentId = (~~(Math.random() * 1e9)).toString(36) + Date.now()
//
//     const sioClient = this
//           .listenersRefs[Object.keys(this.listenersRefs)[0]].io
//
//     const spOptions = { initiator: true, trickle: false }
//
//     // Use custom WebRTC implementation
//     if (this.wrtc) { spOptions.wrtc = this.wrtc }
//
//     const channel = new SimplePeer(spOptions)
//     // const conn = new Connection(toPull.duplex(channel))
//
//     let connected = false
//     channel.on('signal', (signal) => {
//       sioClient.emit('ss-handshake', {
//         intentId: intentId,
//         fromId: this._id.toString(),
//         toId: peer.id.toString(),
//         signal: signal
//       })
//     })
//
//     channel.once('timeout', () => callback(new Error('timeout')))
//
//     channel.once('error', (err) => {
//       if (!connected) { callback(err) }
//     })
//
//     sioClient.on('ws-handshake', (offer) => {
//       if (offer.intentId === intentId && offer.err) {
//         return callback(new Error(offer.err))
//       }
//
//       if (offer.intentId !== intentId || !offer.answer) {
//         return
//       }
//
//       channel.once('connect', () => {
//         connected = true
//         // conn.destroy = channel.destroy.bind(channel)
//
//         // channel.once('close', () => this.emit('close'))
//
//         // conn.getObservedAddrs = (callback) => callback(null, [ma])
//
//         callback(null, channel)
//       })
//
//       channel.signal(offer.signal)
//     })
//
//     return channel
//   }
//
//   listen (peer) {
//
//   }
//
//   close () {
//
//   }
// }

module.exports = {WebRTCReciever, WebRTCInitiator}
