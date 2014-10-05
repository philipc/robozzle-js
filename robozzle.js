var robozzle = { };

robozzle.service = function (method, data, success) {
    $.soap({
        url: '/RobozzleService.svc',
        appendMethodToURL: false,
        namespaceURL: 'http://tempuri.org/',
        SOAPAction: 'http://tempuri.org/IRobozzleService/' + method,
        method: method,
        data: data,
        /* wss: */
        success: function (soapResponse) {
            success(soapResponse.toJSON().Body[method + 'Response']);
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
        console.log(response.solved);
        _inst.topSolversResponse($('#topsolvers'),
                response.solved.int,
                response.names.string);
        _inst.topSolversResponse($('#topsolverstoday'),
                response.solvedToday.int,
                response.namesToday.string);
        $('#scoreboard').show();
    });
};

$(document).ready(function() {
    robozzle.topSolvers();
});
