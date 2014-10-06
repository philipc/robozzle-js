var robozzle = {
    sortKind: 1, /* Easy to hard */
    blockIndex: 0,
    blockSize: 64,
    pageIndex: 0,
    pageSize: 8,
    levels: null,
    levelCount: 1
};

robozzle.parseXML = function (node) {
    if (node.nodeType == 3) {
        return node.nodeValue.replace(/^\s+/,'').replace(/\s+$/,'');
    } else if (node.nodeType == 1) {
        var obj = {};
        for (var childNode = node.firstChild; childNode; childNode = childNode.nextSibling) {
            //console.log([childNode.nodeName, childNode.nodeType, childNode.namespaceURI]);
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

robozzle.displayLevel = function (level) {
    var html = $('#templates .levelitem').clone();
    html.find('div.title').text(level.Title);
    html.find('a.difficulty').text(Math.round(level.DifficultyVoteSum / level.DifficultyVoteCount * 100) / 100);
    html.find('a.stats').attr('href', 'puzzle.aspx?id=' + level.Id),
    html.find('a.comments')
        .text(level.CommentCount + ' comments')
        .attr('href', 'forums/thread.aspx?puzzle=' + level.Id);
    html.find('a.author')
        .text(level.SubmittedBy)
        .attr('href', 'user.aspx?name=' + level.SubmittedBy);
    html.find('a.liked').text('+' + level.Liked);
    html.find('a.disliked').text('-' + level.Disliked);
    return html;
};

robozzle.displayLevels = function () {
    var levellist = $('#levellist');
    levellist.empty();
    for (var i = 0; i < this.pageSize; i++) {
        var index = this.pageIndex + i;
        if (index < this.levelCount) {
            var level = this.levels[index - this.blockIndex];
            console.log(index);
            console.log(level);
            levellist.append(this.displayLevel(level));
        }
    }
};

robozzle.getLevels = function () {
    var _inst = this;
    if (this.levels && this.pageIndex >= this.blockIndex
            && this.pageIndex < this.blockIndex + this.blockSize) {
        this.displayLevels();
        return;
    }
    if (this.pageIndex >= this.levelCount) {
        this.pageIndex = this.levelCount - 1;
    }
    this.blockIndex = this.pageIndex % this.blockSize;
    var request = {
        blockIndex: this.blockIndex,
        blockSize: this.blockSize,
        sortKind: this.sortKind,
        unsolvedByUser: 'keba'
    };
    this.service('GetLevelsPaged', request, function (response) {
        _inst.levelCount = response.totalCount;
        _inst.levels = response.GetLevelsPagedResult.LevelInfo2;
        console.log(_inst.levels);
        _inst.displayLevels();
    });
};

$(document).ready(function() {
    robozzle.topSolvers();
    robozzle.getLevels();
});
