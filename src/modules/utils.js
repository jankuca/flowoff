(function () {

Object.defineProperty(Function.prototype, 'initializing', {
    value: false,
    writable: true,
});
Object.defineProperty(Function.prototype, '$super', {
    value: function () {
        throw new Error('The $super method is not available.');
    },
    writable: true,
});

Function.prototype.inherit = function (init, props) {
    if (arguments.length === 1 && typeof init !== 'function') {
        props = arguments[0];
        init = undefined;
    }
    props = props || {};

    var parent = this,
        prototype;
    try {
        this.initializing = true;
        prototype = new this();
        this.initializing = false;
    } catch (exc) {
        throw new Error('Not possible to inherit from this function');
    }

    var createChildMethod = function (key, fn) {
        return function () {
            var tmp = this.$super,
                _parent = parent.prototype,
                _super;
            do {
                _super = _parent;
                if (_parent.constructor === Object) {
                    break;
                }
                _parent = Object.getPrototypeOf(_parent);
            } while (_super[key] === undefined);
            if (_super[key] !== undefined) {
                this.$super = _super[key];
            }
            var res = fn.apply(this, Array.prototype.slice.call(arguments));
            this.$super = tmp;
            return res;
        };
    };
    Object.getOwnPropertyNames(props).forEach(function (key) {
        if (typeof props[key] === 'function') {
            prototype[key] = createChildMethod(key, props[key]);
        } else {
            var desc = Object.getOwnPropertyDescriptor(prototype, key);
            if (desc === undefined || desc.configurable) {
                Object.defineProperty(prototype, key, Object.getOwnPropertyDescriptor(props, key));
            }
        }
    });

    var Function = function () {
        if (!this.initializing) {
            var args = Array.prototype.slice.call(arguments);
            if (parent !== window.Function) {
                parent.apply(this, args);
            }
            if (typeof init === 'function') {
                init.apply(this, args);
            }
        }
    };

    var skip = Object.getOwnPropertyNames(function () {}).concat(['__children__']);
    Object.getOwnPropertyNames(parent).forEach(function (key) {
        if (skip.indexOf(key) === -1) {
            Object.defineProperty(this, key, Object.getOwnPropertyDescriptor(parent, key));
        }
    }, Function);

    Function.prototype = prototype;
    prototype.constructor = Function;

    if (Object.getOwnPropertyDescriptor(this, '__children__') === undefined) {
        Object.defineProperty(this, '__children__', {
            value: [],
        });
    }
    this.__children__.push(Function);

    return Function;
};

Function.prototype.getChildFunctions = function () {
    return (this.__children__ !== undefined) ? this.__children__.slice() : [];
};

}());

var CustomEvent = function (type) {
    var e = document.createEvent('CustomEvent');
    e.initCustomEvent.apply(e, Array.prototype.slice.call(arguments));
    return e;
};
var NativeMouseEvent = MouseEvent;
var MouseEvent = function (type) {
    var e = document.createEvent('MouseEvent');
    e.initMouseEvent.apply(e, Array.prototype.slice.call(arguments));
    return e;
};
MouseEvent.prototype = NativeMouseEvent.prototype;

Object.defineProperty(Object.prototype, 'eventReceiver', {
    get: function () {
        var desc = Object.getOwnPropertyDescriptor(this, '_eventReceiver');
        if (desc === undefined) {
            var rcv = document.createElement('span');
            Object.defineProperty(this, '_eventReceiver', {
                value: rcv,
                writable: false,
            });
        }
        return this._eventReceiver;
    },
    set: function () {
    },
    enumerable: false,
});
Object.defineProperty(Object.prototype, 'addEventListener', {
    value: function (type, listener) {
        var obj = this;
        this.eventReceiver.addEventListener(type, function (e) {
            listener.call(obj, e);
        });
        return this;
    },
    enumerable: false,
});
Object.defineProperty(Object.prototype, 'dispatchEvent', {
    value: function (e) {
        return this.eventReceiver.dispatchEvent(e);
    },
    enumerable: false,
});
Object.defineProperty(Object.prototype, 'fire', {
    value: function (e, detail) {
        if (e instanceof Event) {
            if (detail !== undefined) {
                throw new Error('Invalid usage.');
            }
            if (['click', 'mouseover', 'mouseout', 'mousedown', 'mouseup', 'dblclick'].indexOf(e.type) !== -1) {
                e = new MouseEvent(e.type, true, true, window, detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, 0, null);
            }
            return this.dispatchEvent(e);
        }

        e = new CustomEvent(e, true, true, detail);
        return this.dispatchEvent(e);
    },
    enumerable: false,
});


var chainify = {
    'Element': [
        'addEventListener',
        'removeEventListener'
    ]
};
Object.getOwnPropertyNames(chainify).forEach(function (key) {
    var obj = window[key],
        __slice = Array.prototype.slice;
    /*if (typeof obj !== 'function') {
        throw new Error('Only functions can be chainified.');
    }*/
    chainify[key].forEach(function (key) {
        var fn = this[key];
        if (typeof fn === 'function') {
            this[key] = function () {
                fn.apply(this, __slice.call(arguments));
                return this;
            };
        }
    }, obj.prototype);
});


if (Array.prototype.first === undefined) {
    Array.prototype.first = function () {
        return this[0] || undefined;
    };
}
if (Array.prototype.last === undefined) {
    Array.prototype.last = function () {
        return this.length ? this[this.length - 1] : undefined;
    };
}


var NativeElement = Element;
Element = function(tagName, attrs) {
    tagName = tagName.toLowerCase();
    var el = document.createElement(tagName);
    if (attrs !== undefined) {
        Object.getOwnPropertyNames(attrs).forEach(function (key) {
            this.setAttribute(key, attrs[key]);
        }, el);
    }
    return el;
};
Element.prototype = NativeElement.prototype;
Element.prototype.html = function (html) {
    if (html === undefined) {
        return this.innerHTML;
    }
    this.innerHTML = (html !== null) ? html : '';
    return this;
};
Element.prototype.attr = function (key, value) {
    if (value === undefined) {
        return this.getAttribute(key);
    }
    this.setAttribute(key, value);
    return this;
};
Element.prototype.data = function (key, value) {
    return this.attr('data-' + key, value);
};
Element.prototype.hasClassName = function (className) {
    return new RegExp('(^|\s)' + className + '(\s|$)').test(this.className);
};
Element.prototype.addClassName = function (className) {
    if (!this.hasClassName(className)) {
        this.className += ' ' + className;
        this.className = this.className.replace(/(^\s+|\s+$)/g, '');
    }
    return this;
};
Element.prototype.removeClassName = function (className) {
    var e = this.className.split(/\s+/),
        index = e.indexOf(className);
    if (index > -1) {
        delete e[index];
        this.className = e.join(' ');
    }
    return this;
};
Element.prototype.show = function () {
    if (this.style.display === 'none') {
        this.style.display = '';
    }
    return this;
};
Element.prototype.hide = function () {
    if (this.style.display !== 'none') {
        this.style.display = 'none';
    }
    return this;
};
Element.prototype.insert = function () {
    var input = arguments[0];
    switch (typeof input) {
    case 'undefined':
        throw new Error('Missing input');
    case 'string':
    case 'number':
        this.appendChild(document.createTextNode(input));
        break;
    case 'object':
        if (input instanceof Element) {
            this.appendChild(input)
        } else {
            Object.getOwnPropertyNames(input).forEach(function (pos) {
                var els = input[pos],
                    parent;
                els = (els instanceof Array) ? els : [els];         
                switch (pos) {
                case 'top':
                    els.forEach(function (el) {
                        this.firstChild ? this.insertBefore(el, this.firstChild) : this.appendChild(el);
                    }, this);
                    break;
                case 'bottom':
                    els.forEach(function (el) {
                        this.appendChild(el);
                    }, this);
                    break;
                case 'before':
                    parent = this.parentNode;
                    if (!parent) {
                        throw new Error('No parent node');
                    }
                    els.forEach(function (el) {
                        parent.insertBefore(el, this);
                    }, this);
                    break;
                case 'after':
                    parent = this.parentNode;
                    if (!parent) {
                        throw new Error('No parent node');
                    }
                    if (parent.lastChild === this) {
                        els.forEach(function (el) {
                            parent.appendChild(el);
                        });
                    } else {
                        var next = this.nextSibling;
                        els.forEach(function (el) {
                            parent.insertBefore(el, next);
                        });
                    }
                    break;
                }
            }, this);
        }
        break;
    }
    return this;
};
Element.prototype.find = function (selector) {
    return Array.prototype.slice.call(this.querySelectorAll(selector));
};
Element.prototype.remove = function () {
    var parent = this.parentNode;
    if (!parent) {
        throw new Error('No parent node');
    }
    parent.removeChild(this);
    return this;
};