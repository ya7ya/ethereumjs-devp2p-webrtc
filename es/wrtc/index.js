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

/**
 * WebRTC-TCP - Emulates TCP server over WebRTC - used by this RLPx implementation
 */
class WebRTCTCP extends EventEmitter {
  constructor (options) {
    super(options)
    this._id = options.id || null
    this.wrtc = options.wrtc || null
    this.channels = {}
    this.sioUrl = options.starUrl || 'http://localhost:9090/'
    // const sioUrl = 'http://localhost:9090/' // the socket io star server.

    // this.io = io.connect(sioUrl, sioOptions)
    // this.io.on('ws-handshake', this.incomingConnection.bind(this))

  }

  socket () {
    const intentId = (~~(Math.random() * 1e9)).toString(36) + Date.now()
    let spOptions = {initiator: true}
    if (this.wrtc) {
      spOptions.wrtc = this.wrtc
    }
    this.channels[intentId] = new SimplePeer(spOptions)

    this.channels[intentId].connect = (peer, callback) => {
      console.log('WebRTC socket connecting ... ', peer.id.toString('hex'))
      let connected = false
      this.channels[intentId].once('signal', (signal) => {
        console.log('WebRTCInitiator:\tEmitting ss-handshake\n from:', this._id.toString('hex'),
        '\nto: ', peer.id.toString('hex'), '\n signal: ', signal)
        this.io.emit('ss-handshake', {
          intentId: intentId,
          fromId: this._id.toString('hex'),
          toId: peer.id.toString('hex'),
          signal: signal
        })
      })

      this.channels[intentId].on('connect', () => {
        connected = true
        // conn.destroy = channel.destroy.bind(channel)

        // channel.once('close', () => this.emit('close'))

        // conn.getObservedAddrs = (callback) => callback(null, [ma])
        console.log('WebRTCInitiator connected!')
        callback(null, this.channels[intentId])
      })
    }

    return this.channels[intentId]
  }

  incomingConnection (offer) {
    console.log('WebRTCReciever:\tincoming ', offer, '\n id:', this._id.toString('hex'))
    if (!offer) {
      return
    }

    if (offer.answer) {
      if (this.channels[offer.intentId] instanceof SimplePeer) {
        this.channels[offer.intentId].signal(offer.signal)
      }
    } else {
      let spOptions = {}
      if (this.wrtc) {
        spOptions.wrtc = this.wrtc
      }
      this.channels[offer.intentId] = new SimplePeer(spOptions)
      this.channels[offer.intentId].on('connect', () => {
        console.log('WebRTCReciever: connected')
        this.emit('connection', this.channels[offer.intentId])
      })

      this.channels[offer.intentId].on('signal', (signal) => {
        offer.signal = signal
        offer.answer = true
        console.log('WebRTCReciever got Signal', offer, '\n id:', this._id.toString('hex'))
        this.io.emit('ss-handshake', offer)
      })

      this.channels[offer.intentId].on('error', (err) => {
        if (err) console.error('WebRTCReciever: Channel Error ', err)
      })

      console.log('WebRTCReciever signaling ....')
      this.channels[offer.intentId].signal(offer.signal)
    }
  }

  connect (peer, callback) {
    callback = callback ? once(callback) : noop
    const intentId = (~~(Math.random() * 1e9)).toString(36) + Date.now()

    // const sioClient = this
    //       .listenersRefs[Object.keys(this.listenersRefs)[0]].io
    // const sioClient = this.io

    // const spOptions = { initiator: true, trickle: false }
    //
    // // Use custom WebRTC implementation
    // if (this.wrtc) { spOptions.wrtc = this.wrtc }
    this.channels[intentId] = new SimplePeer({initiator: true})
    let connected = false
    this.channels[intentId].once('signal', (signal) => {
      console.log('WebRTCInitiator:\tEmitting ss-handshake\n from:', this._id.toString('hex'),
      '\nto: ', peer.id.toString('hex'), '\n signal: ', signal)
      this.io.emit('ss-handshake', {
        intentId: intentId,
        fromId: this._id.toString('hex'),
        toId: peer.id.toString('hex'),
        signal: signal
      })
    })

    this.channels[intentId].once('timeout', () => callback(new Error('timeout')))

    this.channels[intentId].once('error', (err) => {
      if (!connected) { callback(err) }
    })

    this.io.on('ws-handshake', incomingHandshake.bind(this))

    function incomingHandshake (offer) {
      console.log('WebRTCInitiator:\t incoming handshake ', offer)
      if (offer.intentId === intentId && offer.err) {
        return callback(new Error(offer.err))
      }

      if (offer.intentId !== intentId || !offer.answer) {
        return
      }

      this.channels[intentId].on('connect', () => {
        connected = true
        // conn.destroy = channel.destroy.bind(channel)

        // channel.once('close', () => this.emit('close'))

        // conn.getObservedAddrs = (callback) => callback(null, [ma])
        console.log('WebRTCInitiator connected!')
        callback(null, this.channels[intentId])
      })
      console.log('WebRTCInitiator signaling ....')
      this.channels[intentId].signal(offer.signal)
    }
    return this.channels[intentId]
    // return this
  }

  listen (peer, callback) {
    callback = callback ? once(callback) : noop

    this._id = peer.id
    // const sioUrl = 'http://localhost:9090/' // the socket io star server.
    // const sioUrl = 'https://star.ftl.sh/' // the socket io star server.
    console.log('connecting to ', this.sioUrl)
    this.io = io.connect(this.sioUrl, sioOptions)

    this.io.once('connect_error', callback)
    this.io.once('error', (err) => {
      this.emit('error', err)
      this.emit('close')
    })

    // this.io.on('ws-handshake', incomingConnction.bind(this))
    this.io.on('ws-handshake', this.incomingConnection.bind(this))
    this.io.on('ws-peer', this._peerDiscovered.bind(this))
    this.io.on('connect', () => {
      console.log('WebRTCReciever:\t on Connect, ourId: ', this._id.toString('hex'))
      this.io.emit('ss-join', this._id.toString('hex'))
    })

    this.io.once('connect', () => {
      this.emit('listening')
      callback()
    })

    // function incomingConnection (offer) {
    //   console.log('WebRTCReciever:\tincoming Connection ', offer, '\n id:', this._id.toString('hex'))
    //   if (offer.answer || offer.err) {
    //     return
    //   }
    //
    //   const spOptions = {trickle: false}
    //
    //   if (this.wrtc) { spOptions.wrtc = this.wrtc }
    //
    //   const channel = (this.channels[offer.intentId] instanceof SimplePeer) ? this.channels[offer.intentId] : new SimplePeer({})
    //   // const channel = new SimplePeer({})
    //
    //   channel.on('connect', () => {
    //     console.log('WebRTCReciever: connected')
    //     this.emit('connection', channel)
    //   })
    //
    //   channel.once('signal', (signal) => {
    //     offer.signal = signal
    //     offer.answer = true
    //     console.log('WebRTCReciever got Signal', offer, '\n id:', this._id.toString('hex'))
    //     this.io.emit('ss-handshake', offer)
    //   })
    //
    //   channel.on('error', (err) => {
    //     if (err) console.error('WebRTCReciever: Channel Error ', err)
    //   })
    //
    //   console.log('WebRTCReciever signaling ....')
    //   channel.signal(offer.signal)
    //
    //   this.channels[offer.intentId] = channel
    // }
  }

  close (callback) {
    callback = callback ? once(callback) : noop

    this.io.emit('ss-leave')
    setImmediate(() => {
      this.emit('close')
      callback()
    })
  }

  _peerDiscovered (data) {
    console.log('WebRTCReciever:\tPeer Discovered: ', data.toString('hex'))
    this.emit('peer:new', {id: data})
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

module.exports = {WebRTCTCP}
