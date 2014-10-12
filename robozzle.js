var robozzle = {
    sortKind: 1, /* Easy to hard */
    blockIndex: 0,
    blockSize: 64,
    pageIndex: 0,
    pageSize: 8,
    levels: null,
    levelCount: 1,
    userName: null,
    password: null,
    solvedLevels: {},
    votes: {}
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
            var response = _inst.parseXML(soapResponse.toXML()).Body[method + 'Response'];
            success(response[method + 'Result'], response);
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
    this.service('GetTopSolvers2', {}, function (result, response) {
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
    if (level.DifficultyVoteCount != 0)
        var difficulty = Math.round(level.DifficultyVoteSum / level.DifficultyVoteCount * 100) / 100;
    else
        var difficulty = '-';
    html.find('span.difficulty').text(difficulty);
    html.find('a.stats').attr('href', 'puzzle.aspx?id=' + level.Id),
    html.find('a.comments')
        .text(level.CommentCount + ' comments')
        .attr('href', 'forums/thread.aspx?puzzle=' + level.Id);
    html.find('a.author')
        .text(level.SubmittedBy)
        .attr('href', 'user.aspx?name=' + level.SubmittedBy);
    html.find('span.liked').text('+' + level.Liked);
    html.find('span.disliked').text('-' + level.Disliked);
    if (robozzle.solvedLevels[level.Id.toString()]) {
        html.addClass('solved');
    }
    return html;
};

robozzle.displayLevels = function () {
    if (!this.levels) {
        return;
    }
    var levellist = $('#levellist');
    levellist.empty();
    for (var i = 0; i < this.pageSize; i++) {
        var index = this.pageIndex + i;
        if (index < this.levelCount) {
            var level = this.levels[index - this.blockIndex];
            levellist.append(this.displayLevel(level));
        }
    }
    $('#pagecurrent').val(this.pageIndex / this.pageSize + 1);
    $('#pagemax').text(Math.floor((this.levelCount + this.pageSize - 1) / this.pageSize));
};

robozzle.clampPageIndex = function () {
    if (this.pageIndex < 0) {
        this.pageIndex = 0;
    }
    if (this.pageIndex >= this.levelCount) {
        this.pageIndex = this.levelCount - 1;
    }
    this.pageIndex = this.pageIndex - (this.pageIndex % this.pageSize);
};

robozzle.getLevels = function () {
    var _inst = this;
    this.clampPageIndex();
    if (this.levels && this.pageIndex >= this.blockIndex
            && this.pageIndex < this.blockIndex + this.blockSize) {
        this.displayLevels();
        return;
    }
    this.blockIndex = this.pageIndex - (this.pageIndex % this.blockSize);
    var request = {
        blockIndex: this.blockIndex / this.blockSize,
        blockSize: this.blockSize,
        sortKind: this.sortKind,
        unsolvedByUser: null
    };
    this.service('GetLevelsPaged', request, function (result, response) {
        _inst.levelCount = parseInt(response.totalCount, 10);
        _inst.levels = response.GetLevelsPagedResult.LevelInfo2;
        if (!$.isArray(_inst.levels)) {
            /* Handle only one level in the block */
            _inst.levels = [ _inst.levels ];
        }
        if (_inst.blockIndex >= _inst.levelCount) {
            _inst.setPageIndex(_inst.levelCount);
        } else {
            _inst.displayLevels();
        }
    });
};

robozzle.setPageIndex = function (index) {
    if (this.pageIndex != index) {
        this.pageIndex = index;
        this.getLevels();
    }
};

robozzle.hashPassword = function (password) {
    var salt = "5A6fKpgSnXoMpxbcHcb7";
    return CryptoJS.SHA1(password + salt).toString();
};

robozzle.logIn = function (userName, password, callback) {
    var hash = robozzle.hashPassword(password);
    var request = {
        userName: userName,
        password: hash
    };
    this.service('LogIn', request, function (result, response) {
        if (result === 'true') {
            robozzle.userName = userName;
            robozzle.password = hash;
            robozzle.solvedLevels = {};
            $.each(response.solvedLevels, function (index, value) {
                robozzle.solvedLevels[value] = true;
            });
            robozzle.votes = {};
            $.each(response.votes, function (index, value) {
                robozzle.votes[value.Levelid] = value;
            });
            $('#menu-signin').hide();
            $('#menu-register').hide();
            $('#menu-user').text(robozzle.userName).show();
            $('#menu-signout').show();
            robozzle.displayLevels();
            callback(true);
        } else {
            callback(false);
        }
    });
};

robozzle.logOut = function () {
    robozzle.userName = null;
    robozzle.password = null;
    robozzle.solvedLevels = {};
    robozzle.votes = {};
    $('#menu-signout').hide();
    $('#menu-user').text("").hide();
    $('#menu-register').show();
    $('#menu-signin').show();
    robozzle.displayLevels();
};

$(document).ready(function() {
    $('#pagefirst').click(function () {
        robozzle.setPageIndex(0);
    });
    $('#pageprev').click(function () {
        robozzle.setPageIndex(robozzle.pageIndex - robozzle.pageSize);
    });
    $('#pagenext').click(function () {
        robozzle.setPageIndex(robozzle.pageIndex + robozzle.pageSize);
    });
    $('#pagelast').click(function () {
        robozzle.setPageIndex(robozzle.levelCount);
    });
    $('#pagecurrent').change(function () {
        robozzle.setPageIndex(parseInt($(this).val()) * robozzle.pageSize - 1);
    });

    robozzle.getLevels();
    robozzle.topSolvers();

    var signinForm;
    var signin = $("#dialog-signin").dialog({
        autoOpen: false,
        modal: true,
        buttons: {
            "Sign in": function() {
                signinForm.submit();
            },
            "Cancel": function() {
                signin.dialog("close");
            }
        }
    });
    signinForm = signin.find("form").on("submit", function (event) {
        event.preventDefault();
        robozzle.logIn(
                signin.find('input[name="name"]').val(),
                signin.find('input[name="password"]').val(),
                function (result) {
                    if (result) {
                        signin.dialog("close");
                    } else {
                        signin.find('#signin-error').text("Invalid username/password");
                    }
                });
    });
    $("#menu-signin").on("click", function() {
        signin.dialog("open");
    });
    $("#menu-signout").on("click", robozzle.logOut);
});
