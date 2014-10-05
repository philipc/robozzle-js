var robozzle = { };

robozzle.parseXML = function (node) {
    if (node.nodeType == 3) {
        return node.nodeValue.replace(/^\s+/,'').replace(/\s+$/,'');
    } else if (node.nodeType == 1) {
        var obj = {};
        for (var childNode = node.firstChild; childNode; childNode = childNode.nextSibling) {
            console.log([childNode.nodeName, childNode.nodeType, childNode.namespaceURI]);
            var childVal = this.parseXML(childNode);
            if (childNode.nodeType == 3) {
                return childVal;
            }
            var childName = childNode.localName;
            if (childNode.namespaceURI === 'http://schemas.microsoft.com/2003/10/Serialization/Arrays') {
                if (!$.isArray(obj)) {
                    obj = [];
                }
                obj.push(childVal);
            } else if (obj[childName]) {
                if (!$.isArray(obj[childName])) {
                    obj[childName] = [ obj[childName] ];
                }
                obj[childName].push(childVal);
            } else {
                obj[childName] = childVal;
            };
        }
        return obj;
    } else if (node.nodeType == 9) {
        var obj = this.parseXML(node.documentElement);
        return obj;
    } else {
        return null;
    }
};

robozzle.service = function (method, data, success) {
    var _inst = this;
    $.soap({
        url: '/RobozzleService.svc',
        appendMethodToURL: false,
        namespaceURL: 'http://tempuri.org/',
        SOAPAction: 'http://tempuri.org/IRobozzleService/' + method,
        method: method,
        data: data,
        /* wss: */
        success: function (soapResponse) {
            success(_inst.parseXML(soapResponse.toXML()).Body[method + 'Response']);
        }
    });
};

robozzle.topSolversResponse = function (table, solved, names) {
    for (var i = 0; i < solved.length; i++) {
        table.append(
            $('<tr/>').append(
                $('<td/>').addClass('solved').text(solved[i]),
                $('<td/>').append(
                    $('<a/>')
                        .text(names[i])
                        .attr('href', 'user.aspx?name=' + names[i])
                )
            )
        );
    }
};

robozzle.topSolvers = function () {
    var _inst = this;
    this.service('GetTopSolvers2', {}, function (response) {
        _inst.topSolversResponse($('#topsolvers'),
                response.solved,
                response.names);
        _inst.topSolversResponse($('#topsolverstoday'),
                response.solvedToday,
                response.namesToday);
        $('#scoreboard').show();
    });
};

$(document).ready(function() {
    robozzle.topSolvers();
});
