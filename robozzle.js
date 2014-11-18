var robozzle = {
    // level list info
    levelLoading: false,
    levelReload: false,
    sortKind: 1, /* Easy to hard */
    blockIndex: 0,
    blockSize: 64,
    pageIndex: 0,
    pageSize: 8,
    levels: null,
    levelCount: 1,
    hideSolved: false,

    // user info
    userName: null,
    password: null,
    solvedLevels: {},
    votes: {}
};

(function ( $ ) {
$.fn.updateClass = function (classBase, classVal) {
    var pattern = new RegExp('(^|\s)' + classBase + '-[A-Za-z0-9]+', 'g');
    this.attr('class',
               function (i, c) {
                   return c.replace(pattern, '');
               });
    return classVal === null ? this : this.addClass(classBase + '-' + classVal);
};
})(jQuery);

robozzle.parseXML = function (node) {
    if (node.nodeType == 3) {
        return node.nodeValue.replace(/^\s+/,'').replace(/\s+$/,'');
    } else if (node.nodeType == 1) {
        if (node.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil') === 'true') {
            return null;
        }
        var obj = {};
        for (var childNode = node.firstChild; childNode; childNode = childNode.nextSibling) {
            //console.log([childNode.nodeName, childNode.nodeType, childNode.namespaceURI]);
            var childVal = robozzle.parseXML(childNode);
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
            }
        }
        return obj;
    } else if (node.nodeType == 9) {
        return robozzle.parseXML(node.documentElement);
    } else {
        return null;
    }
};

robozzle.service = function (method, data, success) {
    $.soap({
        url: '/RobozzleService.svc',
        appendMethodToURL: false,
        namespaceURL: 'http://tempuri.org/',
        SOAPAction: 'http://tempuri.org/IRobozzleService/' + method,
        method: method,
        data: data,
        success: function (soapResponse) {
            var response = robozzle.parseXML(soapResponse.toXML()).Body[method + 'Response'];
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
                        .attr('target', '_blank')
                )
            )
        );
    }
};

robozzle.topSolvers = function () {
    robozzle.service('GetTopSolvers2', {}, function (result, response) {
        robozzle.topSolversResponse($('#topsolvers'),
                response.solved,
                response.names);
        robozzle.topSolversResponse($('#topsolverstoday'),
                response.solvedToday,
                response.namesToday);
        $('#scoreboard').show();
    });
};

robozzle.displayLevel = function (level) {
    var html = $('#templates .levelitem').clone();
    html.attr('data-level-id', level.Id);
    html.find('div.title').text(level.Title);
    var difficulty = '-';
    if (level.DifficultyVoteCount !== 0)
        difficulty = Math.round(level.DifficultyVoteSum / level.DifficultyVoteCount * 100) / 100;
    html.find('span.difficulty').text(difficulty);
    html.find('a.stats')
        .attr('href', 'puzzle.aspx?id=' + level.Id)
        .attr('target', '_blank');
    html.find('a.comments')
        .text(level.CommentCount + ' comments')
        .attr('href', 'forums/thread.aspx?puzzle=' + level.Id)
        .attr('target', '_blank');
    if (level.SubmittedBy != null) {
        html.find('a.author')
            .text(level.SubmittedBy)
            .attr('href', 'user.aspx?name=' + level.SubmittedBy)
            .attr('target', '_blank');
    } else {
        html.find('span.author').hide();
    }
    html.find('span.liked').text('+' + level.Liked);
    html.find('span.disliked').text('-' + level.Disliked);
    if (robozzle.solvedLevels[level.Id.toString()]) {
        html.addClass('solved');
    }
    html.click(function () {
        robozzle.setGame($(this).attr('data-level-id'));
    });
    return html;
};

robozzle.displayLevels = function () {
    if (!robozzle.levels || robozzle.levelLoading) {
        return;
    }
    var levellist = $('#levellist');
    levellist.empty();
    for (var i = 0; i < robozzle.pageSize; i++) {
        var index = robozzle.pageIndex + i;
        if (index < robozzle.levelCount) {
            var level = robozzle.levels[index - robozzle.blockIndex];
            levellist.append(robozzle.displayLevel(level));
        }
    }
    $('#pagecurrent').val(robozzle.pageIndex / robozzle.pageSize + 1);
    $('#pagemax').text(Math.floor((robozzle.levelCount + robozzle.pageSize - 1) / robozzle.pageSize));
};

robozzle.clampPageIndex = function () {
    if (robozzle.pageIndex < 0) {
        robozzle.pageIndex = 0;
    }
    if (robozzle.pageIndex >= robozzle.levelCount) {
        robozzle.pageIndex = robozzle.levelCount - 1;
    }
    robozzle.pageIndex = robozzle.pageIndex - (robozzle.pageIndex % robozzle.pageSize);
};

robozzle.getLevels = function (force) {
    $('#menu li').removeClass('active');
    $('#menu-levels').addClass('active');
    $('#content').children().hide();
    $('#content-levels').show();

    // Prevent multiple requests
    if (robozzle.levelLoading) {
        robozzle.levelReload = true;
        return;
    }
    robozzle.levelReload = false;

    // Check if we need to fetch levels
    robozzle.clampPageIndex();
    if (!force && robozzle.levels && robozzle.pageIndex >= robozzle.blockIndex
            && robozzle.pageIndex < robozzle.blockIndex + robozzle.blockSize) {
        robozzle.displayLevels();
        return;
    }

    // Hide levels and show spinner
    robozzle.levelLoading = true;
    $('#levellist').empty();
    var spinner = new Spinner().spin($('#levellist-spinner')[0]);

    // Build the request
    robozzle.blockIndex = robozzle.pageIndex - (robozzle.pageIndex % robozzle.blockSize);
    var request = {
        blockIndex: robozzle.blockIndex / robozzle.blockSize,
        blockSize: robozzle.blockSize,
        sortKind: robozzle.sortKind,
        unsolvedByUser: null
    };
    if (robozzle.userName && robozzle.hideSolved) {
        request.unsolvedByUser = robozzle.userName;
    }

    // Send the request
    robozzle.service('GetLevelsPaged', request, function (result, response) {
        // Store the response
        robozzle.levelCount = parseInt(response.totalCount, 10);
        robozzle.levels = response.GetLevelsPagedResult.LevelInfo2;
        if (!$.isArray(robozzle.levels)) {
            // Handle only one level in the block
            robozzle.levels = [ robozzle.levels ];
        }

        // Hide the spinner
        spinner.stop();
        robozzle.levelLoading = false;

        // Update the display
        if (robozzle.levelReload) {
            robozzle.getLevels();
        } else if (robozzle.blockIndex >= robozzle.levelCount) {
            robozzle.setPageIndex(robozzle.levelCount);
        } else {
            robozzle.displayLevels();
        }
    });
};

robozzle.setPageIndex = function (index) {
    if (robozzle.pageIndex != index) {
        robozzle.pageIndex = index;
        robozzle.getLevels();
    }
};

robozzle.setSortKind = function (sortKind) {
    if (robozzle.sortKind == sortKind) {
        return;
    }

    $('#levelmenu li').removeClass('active');
    $('#levelmenu li[data-kind="' + sortKind + '"]').addClass('active');
    robozzle.sortKind = sortKind;
};

robozzle.displayBoard = function (level) {
    var board = [];
    var $board = $('<table/>').addClass('board');
    for (var j = 0; j < level.Colors.length; j++) {
        var colors = level.Colors[j];
        var items = level.Items[j];
        var row = [];
        var $row = $('<tr/>');
        for (var i = 0; i < colors.length; i++) {
            var $item = $('<div/>').addClass('item');
            var $cell = $('<td/>').addClass('board').append($item);
            if (items.charAt(i) !== '#') {
                $cell.updateClass('board-color', colors.charAt(i));
                if (items.charAt(i) === '*') {
                    $item.addClass('board-star');
                }
            }
            row.push($cell);
            $row.append($cell);
        }
        board.push(row);
        $board.append($row);
    }
    var $robot = $('<div/>').addClass('robot')
        .updateClass('robot', level.RobotDir)
        .css('left', level.RobotCol * 40 + 'px')
        .css('top', level.RobotRow * 40 + 'px');
    $('#board').empty().append($board).append($robot);
};

robozzle.displayProgram = function (level) {
    var program = [];
    var $sublist = $('#sub-list').empty();
    for (var j = 0; j < 5; j++) {
        var sub = [];
        var $subgrid = $('<div/>').addClass('sub-grid').addClass('table-column');
        for (var i = 0; i < 10; i++) {
            var $command = $('<div/>').addClass('command').text(i);
            var $condition = $('<div/>').addClass('condition').append($command);
            if (i == 5) {
                $subgrid.append($('<br/>'));
            }
            sub.push($condition);
            $subgrid.append($condition);
        }
        program.push(sub);
        var $sublabel = $('<div/>').addClass('sub-label').addClass('table-column').text('F' + (j + 1));
        var $sub = $('<div/>').addClass('sub').addClass('table-row').append($sublabel).append($subgrid);
        $sublist.append($sub);
    }
};

robozzle.displayProgramToolbar = function (level) {
    var $toolbar = $('#program-toolbar').empty();
    var $group = $('<div/>').addClass('icon-group');
    var makeCommand = function (command) {
        return $('<button/>')
            .addClass('icon')
            .append($('<div/>').addClass('command').updateClass('command', command));
    }
    var makeCondition = function (condition) {
        return $('<button/>')
            .addClass('icon')
            .append($('<div/>').addClass('command').updateClass('condition', condition));
    }
    $toolbar.append(
            $('<div/>').addClass('icon-group')
            .append(makeCommand('f'), makeCommand('l'), makeCommand('r')));
    $toolbar.append(
            $('<div/>').addClass('icon-group')
            .append(makeCommand('1'), makeCommand('2'), makeCommand('3'), makeCommand('4'), makeCommand('5')));
    $toolbar.append(
            $('<div/>').addClass('icon-group')
            .append(makeCommand('R'), makeCommand('G'), makeCommand('B')));
    $toolbar.append(
            $('<div/>').addClass('icon-group')
            .append(makeCondition('any'), makeCondition('R'), makeCondition('G'), makeCondition('B')));
}

robozzle.displayGame = function (level) {
    $('#menu li').removeClass('active');
    $('#content').children().hide();
    $('#content-game').show();

    var status = $('#statusbar');
    status.find('span.title').text(level.Title);
    if (!jQuery.isEmptyObject(level.About) && level.About !== null) {
        status.find('div.about').text(level.About).show();
    } else {
        status.find('div.about').hide();
    }
    status.find('a.stats')
        .attr('href', 'puzzle.aspx?id=' + level.Id)
        .attr('target', '_blank');
    status.find('a.comments')
        .text(level.CommentCount + ' comments')
        .attr('href', 'forums/thread.aspx?puzzle=' + level.Id)
        .attr('target', '_blank');

    robozzle.displayBoard(level);
    robozzle.displayProgram(level);
    robozzle.displayProgramToolbar(level);
};

robozzle.setGame = function (id) {
    if (robozzle.levels !== null) {
        var level;
        for (var i = 0; i < robozzle.levels.length; i++) {
            level = robozzle.levels[i];
            if (robozzle.levels[i].Id === id) {
                robozzle.displayGame(level);
                return;
            }
        }
    }
    var request = {
        levelId: id
    };
    robozzle.service('GetLevel', request, function (result, response) {
        robozzle.displayGame(response.GetLevelResult);
    });
};

robozzle.hashPassword = function (password) {
    var salt = '5A6fKpgSnXoMpxbcHcb7';
    return CryptoJS.SHA1(password + salt).toString();
};

robozzle.logIn = function (userName, password, callback) {
    // Build the request
    var request = {
        userName: userName,
        password: password
    };

    // Handle the response in a callback so it can be cancelled if needed
    var callbacks = $.Callbacks();
    callbacks.add(function (result, response) {
        if (result === 'true') {
            // Store the response
            robozzle.userName = userName;
            robozzle.password = password;
            robozzle.solvedLevels = {};
            $.each(response.solvedLevels, function (index, value) {
                robozzle.solvedLevels[value] = true;
            });
            robozzle.votes = {};
            $.each(response.votes, function (index, value) {
                robozzle.votes[value.Levelid] = value;
            });

            localStorage.setItem('userName', userName);
            localStorage.setItem('password', password);

            // Update the display
            $('#menu-signin').hide();
            $('#menu-register').hide();
            $('#menu-user').show()
                .find('a')
                .attr('href', 'user.aspx?name=' + userName)
                .text(userName);
            $('#menu-signout').show();
            robozzle.displayLevels();
            callback(true);
        } else {
            callback(false);
        }
    });

    // Send the request
    robozzle.service('LogIn', request, function (result, response) {
        callbacks.fire(result, response).empty();
    });
    robozzle.logInCallbacks = callbacks;
};

robozzle.logInCancel = function () {
    robozzle.logInCallbacks.empty();
};

robozzle.logOut = function () {
    robozzle.userName = null;
    robozzle.password = null;
    robozzle.solvedLevels = {};
    robozzle.votes = {};

    localStorage.removeItem('userName');
    localStorage.removeItem('password');

    $('#menu-signout').hide();
    $('#menu-user').hide()
        .find('a').removeAttr('href').text('');
    $('#menu-register').show();
    $('#menu-signin').show();
    robozzle.displayLevels();
};

robozzle.css = function (selector, property, value) {
        try {
            document.styleSheets[0].insertRule(selector + ' {' + property + ':' + value + '}',
                document.styleSheets[0].cssRules.length);
        } catch(err) {
            try {
                document.styleSheets[0].addRule(selector, property + ':' + value);
            } catch(err) {}
        }
};

robozzle.cssSVG = function (selector, property, value) {
    var value64 = 'url("data:image/svg+xml;base64,' + window.btoa(value) + '")';
    robozzle.css(selector, property, value64);
};

robozzle.loadSVGTile = function (color, color1, color2) {
    robozzle.cssSVG('td.board-color-' + color, 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">\
            <defs>\
                <linearGradient id="conditionfill" x1="0" y1="0" x2="1" y2="1">\
                    <stop offset="0" stop-color="' + color1 + '"/>\
                    <stop offset="1" stop-color="' + color2 + '"/>\
                </linearGradient>\
            </defs>\
            <rect width="100%" height="100%" fill="url(#conditionfill)" stroke="none"/>\
            <line x1="0" x2="40" y1="1" y2="1" stroke-width="2" stroke-opacity="0.1" stroke="white"/>\
            <line x1="1" x2="1" y1="0" y2="40" stroke-width="2" stroke-opacity="0.1" stroke="white"/>\
            <line x1="0" x2="40" y1="39" y2="39" stroke-width="2" stroke-opacity="0.2" stroke="black"/>\
            <line x1="39" x2="39" y1="0" y2="40" stroke-width="2" stroke-opacity="0.2" stroke="black"/>\
        </svg>');
};

robozzle.loadSVGPaint = function (command, color) {
    robozzle.cssSVG('.command-' + command, 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
            <circle cx="15" cy="15" r="8.5" stroke="black" fill="' + color + '"/>\
        </svg>');
};

robozzle.loadSVGConditionIcon = function (condition, color1, color2) {
    robozzle.cssSVG('.command.condition-' + condition, 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
            <defs>\
                <linearGradient id="conditionfill" x1="0" y1="0" x2="0" y2="1">\
                    <stop offset="0" stop-color="' + color1 + '"/>\
                    <stop offset="1" stop-color="' + color2 + '"/>\
                </linearGradient>\
            </defs>\
            <rect x="4.5" y="4.5" width="21" height="21" fill="url(#conditionfill)" stroke="black"/>\
        </svg>');
};

robozzle.loadSVGCondition = function (condition, color1, color2) {
    robozzle.cssSVG('div.condition-' + condition, 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
            <defs>\
                <linearGradient id="conditionfill" x1="0" y1="0" x2="0" y2="1">\
                    <stop offset="0" stop-color="' + color1 + '"/>\
                    <stop offset="1" stop-color="' + color2 + '"/>\
                </linearGradient>\
            </defs>\
            <rect width="100%" height="100%" fill="url(#conditionfill)" stroke="none"/>\
        </svg>');
};

robozzle.loadSVGIcon = function () {
    robozzle.cssSVG('.icon', 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
            <defs>\
                <linearGradient id="shinebrush" x1="0" y1="0" x2="0" y2="1">\
                    <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>\
                    <stop offset="0.467" stop-color="#ffffff" stop-opacity="0.15"/>\
                    <stop offset="0.475" stop-color="#ffffff" stop-opacity="0"/>\
                    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>\
                </linearGradient>\
            </defs>\
            <rect width="100%" height="100%" fill="#595959" stroke="none"/>\
            <rect width="100%" height="100%" fill="url(#shinebrush)" stroke="none"/>\
        </svg>');
    robozzle.cssSVG('.icon:hover', 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
            <defs>\
                <linearGradient id="shinebrush" x1="0" y1="0" x2="0" y2="1">\
                    <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>\
                    <stop offset="0.467" stop-color="#ffffff" stop-opacity="0.15"/>\
                    <stop offset="0.475" stop-color="#ffffff" stop-opacity="0"/>\
                    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>\
                </linearGradient>\
                <linearGradient id="hovershinebrush" x1="0" y1="0" x2="0" y2="1">\
                    <stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/>\
                    <stop offset="0.467" stop-color="#ffffff" stop-opacity="0.15"/>\
                    <stop offset="0.475" stop-color="#ffffff" stop-opacity="0"/>\
                    <stop offset="0.856" stop-color="#ffffff" stop-opacity="0"/>\
                    <stop offset="1" stop-color="#ffffff" stop-opacity="0.15"/>\
                </linearGradient>\
            </defs>\
            <rect width="100%" height="100%" fill="#393939" stroke="none"/>\
            <rect width="100%" height="100%" fill="url(#hovershinebrush)" stroke="none"/>\
            <rect width="100%" height="100%" fill="url(#shinebrush)" stroke="none"/>\
        </svg>');
    robozzle.cssSVG('.icon:hover:active', 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
            <defs>\
                <linearGradient id="shinebrush" x1="0" y1="0" x2="0" y2="1">\
                    <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>\
                    <stop offset="0.467" stop-color="#ffffff" stop-opacity="0.15"/>\
                    <stop offset="0.475" stop-color="#ffffff" stop-opacity="0"/>\
                    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>\
                </linearGradient>\
                <linearGradient id="pressedbrush" x1="0" y1="0" x2="0" y2="1">\
                    <stop offset="0" stop-color="#000000" stop-opacity="0.30"/>\
                    <stop offset="0.467" stop-color="#000000" stop-opacity="0.30"/>\
                    <stop offset="0.475" stop-color="#ffffff" stop-opacity="0.15"/>\
                    <stop offset="1" stop-color="#ffffff" stop-opacity="0.15"/>\
                </linearGradient>\
            </defs>\
            <rect width="100%" height="100%" fill="#595959" stroke="none"/>\
            <rect width="100%" height="100%" fill="url(#pressedbrush)" stroke="none"/>\
            <rect width="100%" height="100%" fill="url(#shinebrush)" stroke="none"/>\
        </svg>');
};

robozzle.loadSVGConditionNone = function () {
    robozzle.cssSVG('div.condition', 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
            <defs>\
                <linearGradient id="programfill" x1="0" y1="0" x2="0" y2="1">\
                    <stop offset="0" stop-color="#C0C0C0"/>\
                    <stop offset="1" stop-color="#DDDDDD"/>\
                </linearGradient>\
            </defs>\
            <rect x="0.5" y="0.5" width="29" height="29" fill="url(#programfill)" stroke="#404040"/>\
        </svg>');
};

robozzle.loadSVG = function () {
    robozzle.loadSVGTile('R', '#e55858', '#c53838');
    robozzle.loadSVGTile('G', '#53b953', '#339933');
    robozzle.loadSVGTile('B', '#5353ec', '#3333cc');

    robozzle.cssSVG('div.board-star', 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 80 80">\
            <path fill="#ffff33" stroke="black" stroke-opacity="0.4" d="M40,20 35,34 21,34 32,42 28,56 40,48 52,56 48,42 59,34 45,34 z"/>\
        </svg>');

    robozzle.cssSVG('div.robot', 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">\
            <defs>\
                <linearGradient id="robotfill" x1="0" x2="0" y1="0" y2="1">\
                    <stop offset="0.4" stop-color="#808080"/>\
                    <stop offset="0.5" stop-color="#FFFFFF"/>\
                    <stop offset="0.6" stop-color="#808080"/>\
                </linearGradient>\
            </defs>\
            <path fill="url(#robotfill)" stroke="black" stroke-opacity="0.4" d="M8,10 L33,20 8,30 15,20 z"/>\
        </svg>');

    robozzle.cssSVG('.command-f', 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
            <path fill="#eeeeee" stroke="none" d="M14,25 16,25 16,9 19.5,15 21.5,15 16,5 14,5 8.5,15 10.5,15 14,9 z"/>\
        </svg>');

    robozzle.cssSVG('.command-r, .command-l', 'background',
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
        <path fill="#eeeeee" stroke="none" d="M5,25 C5,14 11,11 22,11 L15,7 15,5 25,11 25,13 15,18 15,16 22,13 C12,13 7,15 7,25 z"/>\
        </svg>');
    robozzle.css('.command-l', 'transform', 'scale(-1,1)');

    robozzle.loadSVGPaint('R', '#c53838');
    robozzle.loadSVGPaint('G', '#339933');
    robozzle.loadSVGPaint('B', '#3333cc');

    for (var i = 1; i <= 5; i++) {
        robozzle.cssSVG('.command-' + i, 'background',
            '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">\
                <text text-anchor="middle" x="15" y="22" font-size="18" font-family="Verdana, sans-serif" fill="#eeeeee" stroke="none">F' + i + '</text>\
            </svg>');
    }

    robozzle.loadSVGConditionIcon('any', '#909090', '#606060');
    robozzle.loadSVGConditionIcon('R', '#ff6868', '#c53838');
    robozzle.loadSVGConditionIcon('G', '#63c963', '#339933');
    robozzle.loadSVGConditionIcon('B', '#6363ff', '#3333cc');

    robozzle.loadSVGCondition('any', '#909090', '#606060');
    robozzle.loadSVGCondition('R', '#ff6868', '#c53838');
    robozzle.loadSVGCondition('G', '#63c963', '#339933');
    robozzle.loadSVGCondition('B', '#6363ff', '#3333cc');
    robozzle.loadSVGConditionNone();

    robozzle.loadSVGIcon();
};

$(document).ready(function () {
    robozzle.loadSVG();

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
    $('#refresh').click(function () {
        robozzle.getLevels(true);
    });
    $('#hidesolved').click(function () {
        robozzle.hideSolved = $(this).prop('checked');
        localStorage.setItem('hideSolved', robozzle.hideSolved);
        robozzle.getLevels(true);
    });
    $('#levelmenu li').click(function () {
        robozzle.setSortKind(parseInt($(this).attr('data-kind')));
        robozzle.getLevels(true);
    });
    $('#menu-levels').click(function () {
        robozzle.getLevels(false);
    });

    robozzle.sortKind = -1;
    robozzle.setSortKind(0);
    robozzle.topSolvers();

    var signinForm;
    var signin = $('#dialog-signin').dialog({
        autoOpen: false,
        modal: true,
        buttons: [
            {
                id: 'dialog-signin-button',
                text: 'Sign in',
                click: function () {
                    signinForm.submit();
                }
            },
            {
                text: 'Cancel',
                click: function () {
                    signin.dialog('close');
                }
            }
        ],
        open: function () {
            $('#dialog-signin-button').prop('disabled', false);
            signin.find(':input').prop('disabled', false);
            signin.find('#signin-error').text('');
        },
        close: function () {
            robozzle.logInCancel();
            signin.find('input[name="password"]').val('');
        }
    });
    signinForm = signin.find('form').on('submit', function (event) {
        event.preventDefault();
        $('#dialog-signin-button').prop('disabled', true);
        signin.find(':input').prop('disabled', true);
        robozzle.logIn(
                signin.find('input[name="name"]').val(),
                robozzle.hashPassword(signin.find('input[name="password"]').val()),
                function (result) {
                    $('#dialog-signin-button').prop('disabled', false);
                    signin.find(':input').prop('disabled', false);
                    if (result) {
                        signin.dialog('close');
                    } else {
                        signin.find('#signin-error').text('Invalid username/password');
                    }
                });
    });
    $('#menu-signin').on('click', function () {
        signin.dialog('open');
    });
    $('#menu-signout').on('click', robozzle.logOut);

    var hideSolved = localStorage.getItem('hideSolved');
    if (hideSolved != null) {
        robozzle.hideSolved = hideSolved === 'true';
        $('#hidesolved').prop('checked', robozzle.hideSolved);
    }

    $('#menu li').removeClass('active');
    $('#menu-levels').addClass('active');
    $('#content').children().hide();
    $('#content-levels').show();

    var userName = localStorage.getItem('userName');
    var password = localStorage.getItem('password');
    if (userName !== null && password !== null) {
        var spinner = new Spinner().spin($('#levellist-spinner')[0]);
        robozzle.logIn(userName, password, function (result) {
            spinner.stop();
            robozzle.getLevels(false);
        });
    } else {
        robozzle.getLevels(false);
    }
});
