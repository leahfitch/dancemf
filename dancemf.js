;(function ()
{
    var init = function ()
    {
        var dmf = {
            version: '0.1'
        }
        
        
        /* A central location for app configuration and management */
        
        dmf.Application = function (options)
        {
            this.options = {
                default_store: null
            }
            
            if (options)
            {
                Object.keys(options).forEach(function (n)
                {
                    if (this.options[n])
                    {
                        
                        Object.keys(options[n], function (m)
                        {
                            this.options[n][m] = options[n][m]
                        }.bind(this))
                    }
                })
            }
            
            this.models =
            {
                create: function (name, schema, meta)
                {
                    if (this.models[name])
                    {
                        throw new Error('Attempting to redfine the model "'+name+'"')
                    }
                    
                    var model = dmf.model.create(name, schema, meta)
                    
                    this.models[name] = model
                    
                }.bind(this)
            }
            
            this.views = {
                
            }
            
            this.controllers = {
                
            }
            
            this.events = new dmf.EventHub()
        }
        
        /* A model of application data */
        
        dmf.model = {}
        dmf.model.Model = 
        {
            init: function (fields)
            {
                dmf.EventHub.add_to(this)
                this._fields = fields || {}
                
                var me = this
                Object.keys(this._schema).forEach(function (n)
                {
                    Object.defineProperty(me, n, 
                    {
                        enumerable: true,
                        get: me.get.bind(me, n),
                        set: me.set.bind(me, n)
                    })
                })
                
                this.notify_all()
            },
            
            get: function (name)
            {
                return this._fields[name]
            },
            
            set: function (name, value)
            {
                if (this._schema.hasOwnProperty(name))
                {
                    if (value != this._fields[name])
                    {
                        this._dirty = true
                    }
                    
                    this._fields[name] = value
                    this.fire_change(name)
                }
                else
                {
                    throw new Error("Cannot set unknown property '"+name+"'")
                }
            },
            
            get_fields: function ()
            {
                return this._fields
            },
            
            validate: function (done)
            {
                if (this._meta.validates)
                {
                    var invalid = []
                    
                    Object.keys(this._fields, function (n)
                    {
                        if (!this.is_valid(n))
                        {
                            invalid.push(n)
                        }
                    }.bind(this))
                    
                    if (invalid.length > 0)
                    {
                        done(invalid)
                        return
                    }
                }
                
                done()
            },
            
            is_valid: function (field_name)
            {
                if (!this._schema.hasOwnProperty(field_name))
                {
                    throw new Error("'"+field_name+"' is unknown.")
                }
                
                if (this._schema[field_name] &&
                    this._schema[field_name] instanceof Function)
                {
                    return !(!this._schema[field_name](this._fields[field_name]))
                }
                else
                {
                    return true
                }
            },
            
            notify_all: function ()
            {
                Object.keys(this._fields).forEach(function (n)
                {
                    this.fire_change(n)
                }.bind(this))
            },
            
            fire_change: function (field_name)
            {
                this.fire('change', this, field_name)
                this.fire('change.'+field_name, this)
                
                if (this._meta.validates)
                {
                    if (this.is_valid(field_name))
                    {
                        this.fire('valid', this, field_name)
                        this.fire('valid.'+field_name, this)
                    }
                    else
                    {
                        this.fire('invalid', this, field_name)
                        this.fire('invalid.'+field_name, this)
                    }
                }
            }
        }
        
        dmf.model.create = function (schema, meta)
        {
            var model = function (data) { this.init(data) }
            model.prototype = dmf.model.Model
            model.schema = model.prototype._schema = schema
            model.meta = model.prototype._meta = {
                name: null,
                primary_key: 'id',
                validates: true,
                store: null
            }
            
            if (meta)
            {
                Object.keys(meta).forEach(function (k)
                {
                    model.meta[k] = meta[k]
                })
            }
            
            return model
        }
        
        /* Storage of models */
        dmf.store = {}
        
        /* Store models using the WebStorage API */
        dmf.store.LocalStore = function ()
        {
            if (typeof localStorage == "undefined")
            {
                throw new Error('localStorage is not supported')
            }
        }
        dmf.store.LocalStore.prototype = 
        {
            get: function (model, query, callback)
            {
                var keys = this._get_model_keys(model),
                    models = keys.map(this._get_by_key.bind(this, model)),
                    callback = callback || function () {}
                
                callback(models, null)
            },
            
            get_by_id: function (model, id, query, callback)
            {
                var key = this._get_model_prefix(model) + id,
                    callback = callback || function () {}
                    
                try
                {
                    var inst = this._get_by_key(model, key)
                }
                catch (e)
                {
                    callback(null, e)
                    return
                }
                
                callback(inst, null)
            },
            
            create: function (inst, query, callback)
            {
                this._save(inst, query, callback)
            },
            
            update: function (inst, query, callback)
            {
                this._save(inst, query, callback)
            },
            
            _save: function (inst, query, callback)
            {
                var key = this._get_instance_key(inst),
                    data = JSON.stringify(inst.get_fields()),
                    callback = callback || function () {}
                
                localStorage[key] = data
                
                callback(inst, null)
            },
            
            delete: function (inst, query, callback)
            {
                var key = this._get_instance_key(inst),
                    callback = callback || function () {}
                    
                delete localStorage[key]
                callback(null)
            },
            
            clear: function (model, query, callback)
            {
                this._get_model_keys(model).forEach(function (k)
                {
                    delete localStorage[k]
                })
                
                callback()
            },
            
            _get_instance_key: function (inst)
            {
                var id = inst[inst._meta.primary_key]
                
                if (!id)
                {
                    throw new Error("Attempting to save an instance without a primary key.")
                }
                
                return this._get_model_prefix(inst) + id
            },
            
            _get_model_keys: function (model)
            {
                var prefix = this._get_model_prefix(model),
                    started = false,
                    keys = []
                
                for (var i=0; i<localStorage.length; i++)
                {
                    var key = localStorage.key(i)
                    
                    if (key.substr(0, prefix.length) == prefix)
                    {
                        if (!started)
                        {
                            started = true
                        }
                        
                        keys.push(key)
                    }
                    else if (started)
                    {
                        break
                    }
                }
                
                return keys
            },
            
            _get_model_prefix: function (model)
            {
                var meta = model.meta || model._meta
                
                if (!meta.name)
                {
                    throw new Error("Models without names can't use local storage. Set a value for 'name' in your model's meta definition.")
                }
                
                return 'dmf.models.'+meta.name+'.'
            },
            
            _get_by_key: function (model, key)
            {
                var data = localStorage[key]
                
                if (data)
                {
                    var fields = JSON.parse(data)
                    return new model(fields)
                }
            }
        }
        
        /*
         * Storage that communicates with a server via REST.
         * 
         * All responses from the server must be in JSON. Unless there is an error, all responses should be 200.
         * The following conventions must be observed to be compatible with this client:
         * 
         * GET /things/ - returns a list of objects
         *     
         *     [
         *         { "name": "Thing One" },
         *         { "name": "Thing Two" }
         *     ]
         *     
         * GET /things/<id> - returns a single object with the given ID, or a 404 response
         * 
         *     { "name": "Thing One" }
         * 
         * POST /things/ - accepts "application/x-www-form-urlencoded", returns a single object
         * 
         *     REQUEST BODY:
         *     name=Thing%20Three
         *     
         *     RESPONSE BODY:
         *     { "name": "Thing Three" }
         * 
         * If there is an error in the request data, respond with 400 status and an error object:
         * 
         *     { "error": "See validation errors", "validation_errors": {"name": "This field is required"} }
         *     
         * PUT /things/<id> - same convention as POST but returns a 404 response if there is no object with the given id.
         * 
         * DELETE /things/<id> - delete the object with the given id, or send a 404 response
         */
        dmf.store.RESTStore = function (options)
        {
            this.options = {
                base_url: 'http://localhost/'
            }
            
            Object.keys(options).forEach(function (k)
            {
                if (this.options[k])
                {
                    this.options[k] = options[k]
                }
            }.bind(this))
            
            if (this.options.base_url[this.options.base_url.length - 1] != '/')
            {
                this.options.base_url += '/'
            }
        }
        dmf.store.RESTStore.prototype = 
        {
            get: function (model, query, callback)
            {
                var callback = callback || function () {}
                this._request('GET', this._get_model_path(model), query, null, function (result, error)
                {
                    if (error)
                    {
                        callback(null, error)
                        return
                    }
                    
                    if (result.constructor != Array)
                    {
                        callback(null, new Error("Invalid response from server. Expected an [obj1, obj2, ...], got '"+result+"'"))
                        return
                    }
                    
                    callback(result.map(function (fields)
                    {
                        return new model(fields)
                    }), null)
                })
            },
            
            get_by_id: function (model, id, query, callback)
            {
                var callback = callback || function () {}
                this._request('GET', this._get_model_path(model) + id, query, null, function (fields, error)
                {
                    if (error)
                    {
                        callback(null, error)
                        return
                    }
                    
                    callback(new model(fields))
                })
            },
            
            create: function (inst, query, callback)
            {
                var callback = callback || function () {}
                this._request('POST', this._get_model_path(inst), query, inst.get_fields(), function (result, error)
                {
                    if (error)
                    {
                        callback(null, error)
                    }
                    else
                    {
                        callback(new inst.constructor(result), null)
                    }
                })
            },
            
            update: function (inst, query, callback)
            {
                var callback = callback || function () {}
                this._request('PUT', this._get_inst_path(inst), query, inst.get_fields(), function (result, error)
                {
                    if (error)
                    {
                        callback(null, error)
                    }
                    else
                    {
                        callback(new inst.constructor(result), null)
                    }
                })
            },
            
            delete: function (inst, query, callback)
            {
                var callback = callback || function () {}
                this._request('DELETE', this._get_inst_path(inst), query, null, function (result, error)
                {
                    callback(null, error)
                })
            },
            
            clear: function (model, query, callback)
            {
                var callback = callback || function () {}
                this._request('DELETE', this._get_model_path(model), query, null, function (result, error)
                {
                    callback(null, error)
                })
            },
            
            _get_inst_path: function (inst)
            {
                return this._get_model_path(inst) + inst[inst._meta.primary_key] 
            },
            
            _get_model_path: function (model)
            {
                var meta = model.meta || model._meta
                
                if (!meta.name)
                {
                    throw new Error("Models without names can't use REST storage. Set a value for 'name' in your model's meta definition.")
                }
                
                var name = meta.plural_name ? meta.plural_name : meta.name
                
                return name.toLowerCase() + '/'
            },
            
            _request: function (method, path, query, data, callback)
            {
                var callback = callback || function () {},
                    req = new XMLHttpRequest()
                req.onabort = function ()
                {
                    callback(null, new Error('Request aborted.'))
                }
                req.onerror = function ()
                {
                    callback(null, new Error("Request failed."))
                }
                req.onload = function ()
                {
                    if (this.status != 200)
                    {
                        var error = new Error("An error occurred")
                        try
                        {
                            error.details = JSON.parse(req.responseText)
                        }
                        catch (e) {}
                        error.status = this.status
                        callback(null, error)
                    }
                    else
                    {
                        try
                        {
                            var result = JSON.parse(this.responseText)
                        }
                        catch (e)
                        {
                            callback(null, e)
                            return
                        }
                        
                        callback(result, null)
                    }
                }
                
                if (path[0] == '/')
                {
                    path = path.substr(1)
                }
                
                var url = this.options.base_url + path
                
                if (query)
                {
                    var qs = Object.keys(query).map(function ()
                    {
                        
                    }).join('&')
                    
                    if (qs)
                    {
                        url += '?' + qs
                    }
                }
                
                req.open(method, url, true)
                req.setRequestHeader('Accepts', 'application/x-json,text/javascript,text/plain; charset=utf-8')
                
                if (data)
                {
                    var parts = []
                    
                    Object.keys(data).forEach(function (k)
                    {
                        parts.push(k + '=' + encodeURIComponent(data[k]))
                    })
                    
                    req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
                    req.send(parts.join('&'))
                }
                else
                {
                    req.send()
                }
            }
        }
        
        /* An event notification center with simple, one-off and deferred events. */
        dmf.EventHub = function ()
        {
            this._listeners = {}
            this._one = {}
            this._late = {}
            this._all = []
        }
        dmf.EventHub.prototype =
        {
            /* Bind a callback to an event */
            on: function (name, callback)
            {
                this._call_registration_function(this._on_single, name, callback)
                return this
            },
            
            _on_single: function (name, callback)
            {
                if (!name)
                {
                    return this
                }
                
                if (typeof this._listeners[name] == "undefined")
                {
                    this._listeners[name] = []
                }

                if (this._listeners[name].indexOf(callback) === -1)
                {
                    this._listeners[name].push(callback)
                }
            },
            
            /* Unbind a callback bound with on(), one() or late() */
            off: function (name, callback)
            {
                this._call_registration_function(this._off_single, name, callback)
                return this
            },
            
            _off_single: function (name, callback)
            {
                if (typeof this._listeners[name] == "undefined")
                {
                    return
                }

                var i = this._listeners[name].indexOf(callback)

                if (i !== -1)
                {
                    this._listeners[name].splice(i, 1)
                }
            },
            
            /* Bind a callback to an event, fire the callback only once. If the
             * event was already fired before binding, execute the callback immediately.
             */
            one: function (name, callback)
            {
                this._call_registration_function(this._one_single, name, callback)
                return this
            },
            
            _one_single: function (name, callback)
            {
                if (typeof this._one[name] != "undefined" && 
                    this._one[name].args != "undefined")
                {
                    callback.apply(undefined, this._one[name].args)
                }
                else
                {
                    if (typeof this._one[name] == "undefined")
                    {
                        this._one[name] = { listeners: [] }
                    }
                    
                    if (this._one[name].listeners.indexOf(callback) === -1)
                    {
                        this._one[name].listeners.push(callback)
                    }
                }
            },
            
            /**
             * A combination of one() and on(). Bind a callback to an event. If the event
             * was fired in the past, execute the callback immediately but also listen
             * to future events.
             */
            late: function (name, callback)
            {
                this._call_registration_function(this._late_single, name, callback)
                return this
            },
            
            _late_single: function (name, callback)
            {
                if (!name)
                {
                    return
                }
                
                if (typeof this._late[name] == "undefined")
                {
                    this.on(name, callback)
                }
                else if (this._late[name].args)
                {
                    callback.apply(undefined, this._late[name].args)
                    this.on(name, callback)
                }
                else
                {
                    this._late[name].listeners.push(callback)
                }
            },
            
            _call_registration_function: function (fn, name, callback)
            {
                var bound = fn.bind(this)
                
                name.split(/\s+/).forEach(function (n)
                {
                    bound(n, callback)
                })
            },
            
            /**
             * Bind a callback to ALL events.
             */
            all: function (callback)
            {
                this._all.push(callback)
                return this
            },
            
            /**
             * Fire an event. The first argument is the event name. Subsequent arguments
             * are passed to the event listeners.
             */
            fire: function () /* event_name, [arg1, [arg2, ...]] */
            {
                var name = arguments[0]
                var args = Array.prototype.slice.call(arguments, 1)
                
                if (typeof this._one[name] == "undefined")
                {
                    this._one[name] = { args: args }
                }
                
                if (typeof this._one[name].listeners != "undefined")
                {
                    this._one[name].listeners.forEach(function (listener)
                    {
                        listener.apply(undefined, args)
                    })
                    
                    delete this._one[name].listeners
                }
                
                if (typeof this._listeners[name] != "undefined")
                {
                    this._listeners[name].forEach(function (listener)
                    {
                        listener.apply(undefined, args)
                    })
                }
                
                if (typeof this._late[name] == "undefined")
                {
                    this._late[name] = { args: args, listeners: [] }
                }
                
                if (typeof this._late[name].listeners != "undefined")
                {
                    var me = this
                    this._late[name].listeners.forEach(function (listener)
                    {
                        listener.apply(undefined, args)
                        me.on(name, listener)
                    })
                    
                    this._late[name].listeners = []
                }
                
                if (this._all.length > 0)
                {
                    args.unshift(name)
                    this._all.forEach(function (listener)
                    {
                        listener.apply(undefined, args)
                    })
                }
                
                return this
            }
        }
        dmf.EventHub.add_to = function (obj)
        {
            obj._eventhub = new dmf.EventHub()
            
            for (var n in obj._eventhub)
            {
                if (typeof obj._eventhub[n] == "function")
                {
                    obj[n] = obj._eventhub[n].bind(obj._eventhub)
                }
            }
        }
        
        return dmf
    }
    
    if (typeof define != 'undefined')
    {
        define(init)
    }
    else if (typeof module != 'undefined' && module.exports)
    {
        module.exports = init()
    }
    if (typeof window != 'undefined')
    {
        window.dmf = init()
    }
})()