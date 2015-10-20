var robozzle = {
    urlCallback: null,
    urlTimeout: null,

    // level list info
    levelLoading: false,
    levelReload: false,
    sortKind: 0, /* Campaign */
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
    likeVotes: {},
    difficultyVotes: {},

    // active level info
    level: null,
    selection: false,
    selectionCommand: null,
    selectionCondition: null,
    selectionOffset: null,
    hoverCommand: null,
    hoverCondition: null,
    robotDir: 0,
    robotDeg: 0,
    robotCol: 0,
    robotRow: 0,
    robotAnimation: null,
    robotStates: {
        reset: 0,
        stopped: 1,
        started: 2,
        stepping: 3
    },
    robotState: 0,

    // design info
    designSelection: false,
    designSelectionColor: null,
    designSelectionItem: null,
    designSelectionRobot: null,
    designSelectionOffset: null,
    designHoverColor: null,
    designHoverRobot: null,
};

(function ( $ ) {
$.fn.updateClass = function (classBase, classVal) {
    var pattern = new RegExp('(^|\\s)' + classBase + '-[A-Za-z0-9]+', 'g');
    this.attr('class',
               function (i, c) {
                   return c.replace(pattern, '');
               });
    return classVal === null ? this : this.addClass(classBase + '-' + classVal);
};
})(jQuery);

(function ( $ ) {
$.fn.getClass = function (classBase) {
    var pattern = new RegExp('(^|\\s)' + classBase + '-([A-Za-z0-9]+)');
    var result = pattern.exec(this.attr('class'));
    return result === null ? null : result[2];
};
})(jQuery);

robozzle.parseXML = function (node) {
    if (node.nodeType == Node.TEXT_NODE) {
        return node.nodeValue.replace(/^\s+/,'').replace(/\s+$/,'');
    } else if (node.nodeType == Node.ELEMENT_NODE) {
        if (node.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil') === 'true') {
            return null;
        }
        var obj = {};
        for (var childNode = node.firstChild; childNode; childNode = childNode.nextSibling) {
            //console.log([childNode.nodeName, childNode.nodeType, childNode.namespaceURI]);
            var childVal = robozzle.parseXML(childNode);
            if (childNode.nodeType == Node.TEXT_NODE) {
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
    } else if (node.nodeType == Node.DOCUMENT_NODE) {
        return robozzle.parseXML(node.documentElement);
    } else {
        return null;
    }
};

robozzle.encodeSOAPObject = function (SOAPObject, prefix, name, data, depth) {
    var soapObject = new SOAPObject(prefix + name);

    var childObject;
    var childName;
    if (data === null) {
        soapObject.attr('xsi:nil', 'true');
    } else if ($.isArray(data)) {
        prefix = 'ns' + depth;
        soapObject.attr('xmlns:' + prefix, 'http://schemas.microsoft.com/2003/10/Serialization/Arrays');
        for (var i = 0; i < data.length; i++) {
            childName = typeof data[i] == 'number' ? 'int' : 'string';
            childObject = robozzle.encodeSOAPObject(SOAPObject, prefix + ':', childName, data[i], depth + 1);
            soapObject.appendChild(childObject);
        }
    } else if (typeof data == 'object') {
        prefix = 'ns' + depth;
        soapObject.attr('xmlns:' + prefix, 'http://schemas.datacontract.org/2004/07/RoboCoder.GameState');
        for (childName in data) {
            childObject = robozzle.encodeSOAPObject(SOAPObject, prefix + ':', childName, data[childName], depth + 1);
            soapObject.appendChild(childObject);
        }
    } else {
        soapObject.val('' + data); // the ''+ is added to fix issues with falsey values.
    }
    return soapObject;
};

robozzle.encodeSOAP = function (SOAPObject, method, data) {
    var soapObject = new SOAPObject(method);
    soapObject.attr('xmlns', 'http://tempuri.org/');

    var childObject;
    var prefix = '';
    var depth = 1;
    for (var childName in data) {
            childObject = robozzle.encodeSOAPObject(SOAPObject, prefix, childName, data[childName], depth);
            soapObject.appendChild(childObject);
    }
    return soapObject;
};

robozzle.service = function (method, data, success, error) {
    $.soap({
        url: '/RobozzleService.svc',
        appendMethodToURL: false,
        namespaceURL: 'http://tempuri.org/',
        SOAPAction: 'http://tempuri.org/IRobozzleService/' + method,
        method: method,
        data: function (SOAPObject) { return robozzle.encodeSOAP(SOAPObject, method, data); },
        success: function (soapResponse) {
            var response = robozzle.parseXML(soapResponse.toXML()).Body[method + 'Response'];
            success(response[method + 'Result'], response);
        },
        error: function (soapResponse) {
            if (error) error();
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

robozzle.displayDifficulty = function (level, html) {
    var difficultyAvg = 0;
    if (level.DifficultyVoteCount !== 0)
        difficultyAvg = Math.round(level.DifficultyVoteSum / level.DifficultyVoteCount * 10);
    var $difficultyVal = html.find('.difficulty-val');
    for (var i = 0; i < 5; i++) {
        var val = difficultyAvg - i * 10;
        if (val > 10) {
            val = 10;
        }
        if (val < 0) {
            val = 0;
        }
        $difficultyVal.eq(i).updateClass('difficulty-val', val);
    }
};

robozzle.displayLevel = function (level) {
    var html = $('#templates .levelitem').clone();
    html.attr('data-level-id', level.Id);
    html.find('div.title').text(level.Title);
    robozzle.displayDifficulty(level, html);
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
    if (robozzle.solvedLevels[level.Id]) {
        html.addClass('solved');
    }
    html.click(function () {
        robozzle.navigatePuzzle($(this).attr('data-level-id'));
    });
    html.find('.stats').click(function (e) {
        e.stopPropagation();
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
    robozzle.setPageTab('levels');

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
    $('.level-menu__item').removeClass('level-menu__item--active');
    $('.level-menu__item[data-kind="' + sortKind + '"]').addClass('level-menu__item--active');
    robozzle.sortKind = sortKind;
};

robozzle.setRobotState = function (state) {
    robozzle.robotState = state;
    if (robozzle.robotState == robozzle.robotStates.reset
            || robozzle.robotState == robozzle.robotStates.stopped
            || robozzle.robotState == robozzle.robotStates.stepping) {
        $('#program-go').text('Go!');
    } else {
        $('#program-go').text('Reset');
    }
    $('#program-step').prop('disabled', robozzle.robotState == robozzle.robotStates.finished);
};

robozzle.displayRobot = function () {
    var state = robozzle.robotAnimation;
    $('#robot')
        .css('left', state.left + 'px')
        .css('top', state.top + 'px')
        .css('transform', 'rotate(' + (((state.deg % 360) + 360) % 360) + 'deg) scale(' + state.scale + ')');
};

robozzle.animateRobot = function (props) {
    $(robozzle.robotAnimation).animate(props, {
        duration: robozzle.robotDelay,
        easing: "linear",
        progress: robozzle.displayRobot
    });
};

robozzle.displayBoard = function (level) {
    var stars = 0;
    var board = [];
    var $board = $('<table/>').addClass('board');
    for (var j = 0; j < level.Colors.length; j++) {
        var colors = level.Colors[j];
        var items = level.Items[j];
        var row = [];
        var $row = $('<tr/>');
        for (var i = 0; i < colors.length; i++) {
            var $item = $('<div/>').addClass('item');
            var $cell = $('<td/>')
                .attr('data-col', i)
                .attr('data-row', j)
                .addClass('board')
                .append($item);
            if (items.charAt(i) !== '#') {
                $cell.updateClass('board-color', colors.charAt(i));
                if (items.charAt(i) === '*') {
                    $item.addClass('board-star');
                    stars++;
                }
            }
            $cell.click(function (e) {
                e.stopPropagation();
            });
            $cell.on('mousedown', function (e) {
                if (robozzle.designSelection) {
                    robozzle.clickDesignSelection($(this));
                    robozzle.hoverDesignSelection($(this));
                    robozzle.moveDesignSelection($(this));
                    e.stopPropagation();
                }
            });
            $cell.on('mousemove', function (e) {
                if (robozzle.designSelection) {
                    if (e.buttons & 1) {
                        robozzle.clickDesignSelection($(this));
                    }
                }
                robozzle.hoverDesignSelection($(this));
                robozzle.moveDesignSelection($(this));
                e.stopPropagation();
            });
            $cell.on('mousedown', function (e) {
                // Prevent dragging the image
                e.preventDefault();
            });
            row.push($cell);
            $row.append($cell);
        }
        board.push(row);
        $board.append($row);
    }
    var $robot = $('<div/>').attr('id', 'robot').addClass('robot');
    $('#board').empty().append($board).append($robot);
    robozzle.board = board;
    robozzle.starsMax = stars;
    robozzle.stars = stars;
    robozzle.steps = 0;
    robozzle.stack = [ { sub: 0, cmd: 0 } ];
    robozzle.robotDir = level.RobotDir;
    robozzle.robotDeg = level.RobotDir * 90;
    robozzle.robotCol = level.RobotCol;
    robozzle.robotRow = level.RobotRow;
    robozzle.robotAnimation = {
        left: robozzle.robotCol * 40,
        top: robozzle.robotRow * 40,
        deg: robozzle.robotDeg,
        scale: 1.0
    };
    robozzle.displayRobot();
    robozzle.setRobotState(robozzle.robotStates.stopped);
};

robozzle.allowedCommand = function (command) {
    if (!robozzle.level) {
        return;
    }

    if (command == 'f' || command == 'l' || command == 'r') {
        return true;
    }

    if (command == '1') {
        return parseInt(robozzle.level.SubLengths[0]);
    }
    if (command == '2') {
        return parseInt(robozzle.level.SubLengths[1]);
    }
    if (command == '3') {
        return parseInt(robozzle.level.SubLengths[2]);
    }
    if (command == '4') {
        return parseInt(robozzle.level.SubLengths[3]);
    }
    if (command == '5') {
        return parseInt(robozzle.level.SubLengths[4]);
    }

    var allowedCommands = parseInt(robozzle.level.AllowedCommands);
    if (command == 'R') {
        return allowedCommands & 1;
    }
    if (command == 'G') {
        return allowedCommands & 2;
    }
    if (command == 'B') {
        return allowedCommands & 4;
    }

    return false;
};

robozzle.hoverSelection = function (condition, command) {
    robozzle.hoverCondition = condition;
    robozzle.hoverCommand = command;
};

robozzle.moveSelection = function ($src, x, y) {
    if ($src) {
        robozzle.selectionOffset = $src.offset();
        robozzle.selectionOffset.left--;
        robozzle.selectionOffset.top--;
        $('#program-selection').addClass('program-selection-highlight');
    } else if (x || y) {
        robozzle.selectionOffset = { left: x, top: y };
        $('#program-selection').removeClass('program-selection-highlight');
    } else if (!robozzle.selectionOffset) {
        robozzle.selectionOffset = $('#program-container').offset();
    }
    $('#program-selection').offset(robozzle.selectionOffset);
    $('#program-selection').updateClass('condition', robozzle.selectionCondition || robozzle.hoverCondition || 'any');
    $('#program-selection .command').updateClass('command', robozzle.selectionCommand || robozzle.hoverCommand || null);
};

robozzle.setSelection = function (condition, command) {
    if (!$('#program-toolbar').is(':visible')) {
        return;
    }
    if (!condition && !command) {
        return;
    }
    if (command && !robozzle.allowedCommand(command)) {
        return;
    }
    robozzle.stepReset();
    robozzle.selection = true;
    robozzle.selectionCondition = condition;
    robozzle.selectionCommand = command;
    $('#program-selection').css('visibility', 'visible');
    robozzle.moveSelection();
};

robozzle.hideSelection = function (condition, command) {
    $('#program-selection').css('visibility', 'hidden');
    robozzle.selection = false;
};

robozzle.encodeBits = function (encodeState, val, bits)
{
    for (var i = 0; i < bits; i++) {
        if (val & (1 << i)) {
            encodeState.val |= (1 << encodeState.bits);
        }
        encodeState.bits++;
        if (encodeState.bits == 6) {
            var c;
            if (encodeState.val < 26) {
                c = String.fromCharCode(97 + encodeState.val);
            } else if (encodeState.val < 52) {
                c = String.fromCharCode(65 + encodeState.val - 26);
            } else if (encodeState.val < 62) {
                c = String.fromCharCode(48 + encodeState.val - 52);
            } else if (encodeState.val < 62) {
                c = '_';
            } else {
                c = '-';
            }
            encodeState.output = encodeState.output + c;
            encodeState.val = 0;
            encodeState.bits = 0;
        }
    }
};

robozzle.encodeCommand = function (encodeState, cond, cmd) {
    switch (cond) {
    case 'R': cond = 1; break;
    case 'G': cond = 2; break;
    case 'B': cond = 3; break;
    default: cond = 0; break;
    }

    var subcmd;
    var sublen = 0;
    switch (cmd) {
    case 'f': cmd = 1; break;
    case 'l': cmd = 2; break;
    case 'r': cmd = 3; break;
    case '1': cmd = 4; subcmd = 0; sublen = 3; break;
    case '2': cmd = 4; subcmd = 1; sublen = 3; break;
    case '3': cmd = 4; subcmd = 2; sublen = 3; break;
    case '4': cmd = 4; subcmd = 3; sublen = 3; break;
    case '5': cmd = 4; subcmd = 4; sublen = 3; break;
    case 'R': cmd = 5; subcmd = 1; sublen = 2; break;
    case 'G': cmd = 5; subcmd = 2; sublen = 2; break;
    case 'B': cmd = 5; subcmd = 3; sublen = 2; break;
    default: cmd = 0; break;
    }

    robozzle.encodeBits(encodeState, cond, 2);
    robozzle.encodeBits(encodeState, cmd, 3);
    if (sublen) {
        robozzle.encodeBits(encodeState, subcmd, sublen);
    }
};

robozzle.encodeProgram = function () {
    var encodeState = {
        output: '',
        val: 0,
        bits: 0
    };

    robozzle.encodeBits(encodeState, 0, 3); // Version number = 0
    robozzle.encodeBits(encodeState, robozzle.program.length, 3);
    for (var j = 0; j < robozzle.program.length; j++) {
        var sub = robozzle.program[j];
        robozzle.encodeBits(encodeState, sub.length, 4);
        for (var i = 0; i < sub.length; i++) {
            var $cmd = sub[i];
            var cond = $cmd.getClass('condition');
            var cmd = $cmd.find('.command').getClass('command');
            robozzle.encodeCommand(encodeState, cond, cmd);
        }
    }

    robozzle.encodeBits(encodeState, 0, 5); // Flush
    return encodeState.output;
};

robozzle.decodeBits = function (decodeState, bits)
{
    var val = 0;
    for (var i = 0; i < bits; i++) {
        if (decodeState.bits == 0) {
            var c = decodeState.input.charCodeAt(decodeState.index);
            decodeState.index++;
            if (c >= 97 && c < 97 + 26) {
                decodeState.val = c - 97;
            } else if (c >= 65 && c < 65 + 26) {
                decodeState.val = c - 65 + 26;
            } else if (c >= 48 && c < 48 + 10) {
                decodeState.val = c - 48 + 52;
            } else if (c == 95) {
                decodeState.val = 62;
            } else if (c == 45) {
                decodeState.val = 63;
            } else {
                decodeState.val = 0;
            }
            decodeState.bits = 6;
        }
        if (decodeState.val & (1 << (6 - decodeState.bits))) {
            val |= (1 << i);
        }
        decodeState.bits--;
    }
    return val;
};

robozzle.decodeCommand = function (decodeState) {
    var cond = robozzle.decodeBits(decodeState, 2);
    switch (cond) {
    case 1: cond = 'R'; break;
    case 2: cond = 'G'; break;
    case 3: cond = 'B'; break;
    default: cond = null; break;
    }

    var cmd = robozzle.decodeBits(decodeState, 3);
    switch (cmd) {
    case 1: cmd = 'f'; break;
    case 2: cmd = 'l'; break;
    case 3: cmd = 'r'; break;
    case 4:
            var subcmd = robozzle.decodeBits(decodeState, 3);
            switch (subcmd) {
            case 0: cmd = '1'; break;
            case 1: cmd = '2'; break;
            case 2: cmd = '3'; break;
            case 3: cmd = '4'; break;
            case 4: cmd = '5'; break;
            default: cmd = null; break;
            }
            break;
    case 5:
            var subcmd = robozzle.decodeBits(decodeState, 2);
            switch (subcmd) {
            case 1: cmd = 'R'; break;
            case 2: cmd = 'G'; break;
            case 3: cmd = 'B'; break;
            default: cmd = null; break;
            }
            break;
    default: cmd = null; break;
    }

    return [ cond, cmd ];
};

robozzle.decodeProgram = function (input) {
    if (!input) {
        return null;
    }

    var decodeState = {
        input: input,
        index: 0,
        val: 0,
        bits: 0
    };

    var version = robozzle.decodeBits(decodeState, 3);
    if (version != 0) {
        return null;
    }

    var program = [];
    var length = robozzle.decodeBits(decodeState, 3);
    for (var j = 0; j < length; j++) {
        var sub = [];
        var sublen = robozzle.decodeBits(decodeState, 4);
        for (var i = 0; i < sublen; i++) {
            sub.push(robozzle.decodeCommand(decodeState));
        }
        program.push(sub);
    }

    return program;
};

robozzle.displayProgram = function (level, commands) {
    if (!commands) {
        commands = [];
    }
    var program = [];
    var $sublist = $('#sub-list').empty();
    for (var j = 0; j < 5; j++) {
        var sub = [];
        var sublength = parseInt(level.SubLengths[j]);
        if (!sublength) {
            program.push(sub);
            continue;
        }
        var $subgrid = $('<div/>').addClass('sub-grid').addClass('table-column');
        for (var i = 0; i < sublength; i++) {
            var $condition = $('<div/>')
                .addClass('sub-cell')
                .addClass('condition')
                .on('mousemove', function (e) {
                    robozzle.hoverSelection($(this).getClass('condition'),
                                            $(this).find('.command').getClass('command'));
                    robozzle.moveSelection($(this));
                    e.stopPropagation();
                })
                .click(function (e) {
                    if (robozzle.selection) {
                        if (robozzle.selectionCondition) {
                            $(this).updateClass('condition', robozzle.selectionCondition);
                        } else if (!$(this).getClass('condition')) {
                            $(this).updateClass('condition', 'any');
                        }
                        if (robozzle.selectionCommand) {
                            $(this).find('.command').updateClass('command', robozzle.selectionCommand);
                        }
                        $(this).find('span').hide();
                        robozzle.hideSelection();
                    } else {
                        robozzle.setSelection($(this).getClass('condition'),
                                              $(this).find('.command').getClass('command'));

                        $(this).updateClass('condition', null);
                        $(this).find('.command').updateClass('command', null);
                        $(this).find('span').show();
                    }
                    robozzle.hoverSelection($(this).getClass('condition'),
                                            $(this).find('.command').getClass('command'));
                    if (robozzle.level.Id) {
                        robozzle.setPuzzleUrl(robozzle.level.Id, function () {
                            return robozzle.encodeProgram();
                        });
                    } else {
                        robozzle.setDesignUrl(function () {
                            return robozzle.encodeDesign(robozzle.design);
                        }, function () {
                            return robozzle.encodeProgram();
                        });
                    }
                    e.stopPropagation();
                });
            var $command = $('<div/>').addClass('command');
            var $label = $('<span/>').text(i);
            if (j < commands.length && i < commands[j].length) {
                // TODO: validate commands
                if (commands[j][i][0] != null) {
                    $condition.updateClass('condition', commands[j][i][0]);
                    $command.updateClass('command', commands[j][i][1]);
                    $label.hide();
                } else if (commands[j][i][1] != null) {
                    $condition.updateClass('condition', 'any');
                    $command.updateClass('command', commands[j][i][1]);
                    $label.hide();
                }
            }
            if (i == 5 && sublength != 5) {
                $subgrid.append($('<br/>'));
            }
            sub.push($condition);
            $subgrid.append($condition.append($command.append($label)));
        }
        program.push(sub);
        var $sublabel = $('<div/>').addClass('sub-label').addClass('table-column').text('F' + (j + 1));
        var $sub = $('<div/>').addClass('sub').addClass('table-row').append($sublabel).append($subgrid);
        $sublist.append($sub);
    }
    robozzle.program = program;
};

robozzle.readProgram = function () {
    var program = [];
    for (var j = 0; j < robozzle.program.length; j++) {
        var $sub = robozzle.program[j];
        var sub = [];
        for (var i = 0; i < $sub.length; i++) {
            var $cmd = $sub[i];
            var cond = $cmd.getClass('condition');
            var cmd = $cmd.find('.command').getClass('command');
            sub.push([cond, cmd]);
        }
        program.push(sub);
    }

    return program;
};

robozzle.encodeSolution = function () {
    var program = '';
    for (var j = 0; j < robozzle.program.length; j++) {
        var sub = robozzle.program[j];
        for (var i = 0; sub[i]; i++) {
            var $cmd = sub[i];
            var cond = $cmd.getClass('condition');
            switch (cond) {
            case 'any': program += '_'; break;
            case 'R': program += 'r'; break;
            case 'G': program += 'g'; break;
            case 'B': program += 'b'; break;
            default: continue;
            }
            var cmd = $cmd.find('.command').getClass('command');
            switch (cmd) {
            case 'f': program += 'F'; break;
            case 'l': program += 'L'; break;
            case 'r': program += 'R'; break;
            case '1': program += '1'; break;
            case '2': program += '2'; break;
            case '3': program += '3'; break;
            case '4': program += '4'; break;
            case '5': program += '5'; break;
            case 'R': program += 'r'; break;
            case 'G': program += 'g'; break;
            case 'B': program += 'b'; break;
            default: program += '_'; break;
            }
        }
        program += '|';
    }
    return program;
};

robozzle.submitSolution = function () {
    if (!robozzle.level || !robozzle.userName || !robozzle.password)
        return;

    robozzle.solvedLevels[robozzle.level.Id] = true;

    var request = {
        levelId: robozzle.level.Id,
        userName: robozzle.userName,
        password: robozzle.password,
        solution: robozzle.encodeSolution()
    };
    robozzle.service('SubmitSolution', request, function (result, response) {
        // console.log(response.SubmitSolutionResult);
    });
};

robozzle.submitLevelVote = function () {
    if (!robozzle.level || !robozzle.userName || !robozzle.password)
        return;

    var prevLikeVote = robozzle.likeVotes[robozzle.level.Id] || 0;
    var likeVote;
    if ($('#dialog-solved-like').prop('checked')) {
        likeVote = 1;
    } else if ($('#dialog-solved-dislike').prop('checked')) {
        likeVote = -1;
    } else {
        likeVote = 0;
    }

    var prevDifficultyVote = robozzle.difficultyVotes[robozzle.level.Id] || 0;
    var difficultyVote = $('#dialog-solved-difficulty input:checked').first().val() || 0;

    if (prevLikeVote == likeVote && prevDifficultyVote == difficultyVote)
        return;

    robozzle.likeVotes[robozzle.level.Id] = likeVote;
    robozzle.difficultyVotes[robozzle.level.Id] = difficultyVote;

    var request = {
        userName: robozzle.userName,
        password: robozzle.password,
        levelId: robozzle.level.Id,
        vote0: likeVote,
        vote1: difficultyVote
    };
    robozzle.service('SubmitLevelVote', request, function (result, response) {
    });
};

robozzle.displayProgramToolbar = function (level) {
    var $toolbar = $('#program-toolbar').empty();
    var makeCommand = function (command, title) {
        return $('<button/>')
            .prop('title', title)
            .addClass('icon')
            .append($('<div/>').addClass('command').updateClass('command', command))
            .click(function (e) {
                robozzle.setSelection(null, command);
                e.stopPropagation();
            });
    }
    var makeCondition = function (condition, title) {
        return $('<button/>')
            .prop('title', title)
            .addClass('icon')
            .append($('<div/>').addClass('command').updateClass('condition', condition))
            .click(function (e) {
                robozzle.setSelection(condition, null);
                e.stopPropagation();
            });
    }
    $toolbar.append(
            $('<div/>').addClass('icon-group')
            .append(makeCommand('f', 'Move forward (w)'),
                    makeCommand('l', 'Turn left (q)'),
                    makeCommand('r', 'Turn right (e)')));

    var $group = $('<div/>').addClass('icon-group');
    for (var i = 0; i < 5; i++) {
        if (parseInt(level.SubLengths[i])) {
            $group.append(makeCommand(i + 1, 'Call F' + (i + 1) + ' (' + (i + 1) + ')'));
        }
    }
    $toolbar.append($group);

    var allowedCommands = parseInt(level.AllowedCommands);
    if (allowedCommands) {
        var $group = $('<div/>').addClass('icon-group');
        if (allowedCommands & 1) {
            $group.append(makeCommand('R', 'Paint red (R)'));
        }
        if (allowedCommands & 2) {
            $group.append(makeCommand('G', 'Paint green (G)'));
        }
        if (allowedCommands & 4) {
            $group.append(makeCommand('B', 'Paint blue (B)'));
        }
        $toolbar.append($group);
    }

    $toolbar.append(
            $('<div/>').addClass('icon-group')
            .append(makeCondition('any', 'No condition (n)'),
                    makeCondition('R', 'Red condition (r)'),
                    makeCondition('G', 'Green condition (g)'),
                    makeCondition('B', 'Blue condition (b)')));
}

robozzle.displayGame = function (level, program) {
    robozzle.setPageTab(null);
    $('#content-game').show();
    $('#content-game').children().hide();
    $('#board-container').show();
    $('#program-container').show();
    $('#program-toolbar-container').show();
    $('#program-selection').show();

    robozzle.level = level;

    if (robozzle.level.Id) {
        $('#program-edit').hide();

        var status = $('#statusbar');
        status.find('span.title').text(level.Title);
        if (!jQuery.isEmptyObject(level.About) && level.About !== null) {
            status.find('div.about').text(level.About).show();
        } else {
            status.find('div.about').hide();
        }
        status.find('a.stats')
            .attr('href', 'puzzle.aspx?id=' + level.Id)
            .attr('target', '_blank')
            .show();
        status.find('a.comments')
            .text(level.CommentCount + ' comments')
            .attr('href', 'forums/thread.aspx?puzzle=' + level.Id)
            .attr('target', '_blank')
            .show();
    } else {
        $('#program-edit').show();
    }

    robozzle.displayBoard(level);
    robozzle.displayProgram(level, program);
    robozzle.displayProgramToolbar(level);
};

robozzle.setGame = function (id, program) {
    robozzle.design = null;
    if (robozzle.levels !== null) {
        var level;
        for (var i = 0; i < robozzle.levels.length; i++) {
            level = robozzle.levels[i];
            if (robozzle.levels[i].Id === id) {
                robozzle.displayGame(level, program);
                return;
            }
        }
    }
    var request = {
        levelId: id
    };
    robozzle.service('GetLevel', request, function (result, response) {
        robozzle.displayGame(response.GetLevelResult, program);
    });
};

robozzle.hoverDesignSelection = function ($src) {
    if ($src) {
        robozzle.designHoverColor = $src.getClass('board-color');
        if ($src.attr('data-col') == robozzle.robotCol && $src.attr('data-row') == robozzle.robotRow) {
            robozzle.designHoverRobot = robozzle.robotDir;
        } else {
            robozzle.designHoverRobot = null;
        }
    } else {
        robozzle.designHoverColor = 'none'; // Hack to avoid error style
        robozzle.designHoverRobot = null;
    }
};

robozzle.moveDesignSelection = function ($src, x, y) {
    if ($src) {
        robozzle.designSelectionOffset = $src.offset();
        robozzle.designSelectionOffset.left -= 2;
        robozzle.designSelectionOffset.top -= 2;
        $('#design-selection').addClass('design-selection-highlight');
    } else if (x || y) {
        robozzle.designSelectionOffset = { left: x, top: y };
        $('#design-selection').removeClass('design-selection-highlight');
    } else if (!robozzle.designSelectionOffset) {
        robozzle.designSelectionOffset = $('#design-toolbar-container').offset();
    }
    $('#design-selection').offset(robozzle.designSelectionOffset);

    var color = robozzle.designSelectionColor || robozzle.designHoverColor;
    var item = robozzle.designSelectionItem;
    var robot = robozzle.designSelectionRobot;
    if (robot === null) robot = robozzle.designHoverRobot;
    if (robot === null) robot = 'none';

    if (item === 'star' && (color === null || robot !== 'none')) {
        // Can't put star on empty tile or robot
        color = 'error';
    }

    if (item === 'erase' && robot !== 'none') {
        // Can't erase robot
        color = 'error';
    }

    if (robot !== 'none' && color === null) {
        // Can't put robot on empty tile
        color = 'error';
    }

    $('#design-selection').updateClass('board-color', color);
    $('#design-selection .robot').updateClass('robot', robot);
    $('#design-selection .item').updateClass('board', item);
};

robozzle.setDesignSelection = function (color, item, robot) {
    if (!$('#design-toolbar').is(':visible')) {
        return;
    }
    if (color === null && item === null && robot === null) {
        return;
    }
    robozzle.designSelection = true;
    robozzle.designSelectionColor = color;
    robozzle.designSelectionItem = item;
    robozzle.designSelectionRobot = robot;
    $('#design-selection').css('visibility', 'visible');
    robozzle.moveDesignSelection();
};

robozzle.hideDesignSelection = function (condition, command) {
    $('#design-selection').css('visibility', 'hidden');
    robozzle.designSelection = false;
};

robozzle.clickDesignSelection = function ($cell) {
    if (robozzle.designSelectionColor !== null) {
        $cell.updateClass('board-color', robozzle.designSelectionColor);
        $cell.find('.item').updateClass('board', null);
    } else if (robozzle.designSelectionRobot !== null) {
        if ($cell.getClass('board-color')) {
            $cell.find('.item').updateClass('board', null);
            robozzle.robotCol = parseInt($cell.attr('data-col'));
            robozzle.robotRow = parseInt($cell.attr('data-row'));
            robozzle.robotDir = robozzle.designSelectionRobot;
            robozzle.robotDeg = robozzle.robotDir * 90;
            robozzle.robotAnimation = {
                left: robozzle.robotCol * 40,
                top: robozzle.robotRow * 40,
                deg: robozzle.robotDeg,
                scale: 1.0
            };
            robozzle.displayRobot();
        }
    } else if ($cell.attr('data-col') != robozzle.robotCol || $cell.attr('data-row') != robozzle.robotRow) {
        if (robozzle.designSelectionItem == 'star') {
            if ($cell.getClass('board-color')) {
                $cell.find('.item').updateClass('board', 'star');
            }
        } else if (robozzle.designSelectionItem == 'erase') {
            $cell.updateClass('board-color', null);
            $cell.find('.item').updateClass('board', null);
        }
    }
    robozzle.setDesignUrl(function () {
        return robozzle.encodeDesign(robozzle.readDesign());
    }, function () {
        return robozzle.encodeProgram();
    });
    // TODO: update design hover
};

robozzle.displayDesignToolbar = function () {
    var $toolbar = $('#design-toolbar').empty();
    var makeColor = function (color, title) {
        return $('<div/>')
            .prop('title', title)
            .addClass('board')
            .updateClass('board-color', color)
            .click(function (e) {
                robozzle.setDesignSelection(color, null, null);
                e.stopPropagation();
            });
    }
    var makeItem = function (item, title) {
        return $('<div/>')
            .prop('title', title)
            .addClass('board')
            .addClass('board-icon')
            .append($('<div/>').addClass('item').updateClass('board', item))
            .click(function (e) {
                robozzle.setDesignSelection(null, item, null);
                e.stopPropagation();
            });
    }
    var makeRobot = function (robot, title) {
        return $('<div/>')
            .prop('title', title)
            .addClass('board')
            .addClass('board-icon')
            .append($('<div/>').addClass('robot').updateClass('robot', robot))
            .click(function (e) {
                robozzle.setDesignSelection(null, null, robot);
                e.stopPropagation();
            });
    }
    $toolbar.append(makeColor('R', 'Red tile (r)'));
    $toolbar.append(makeColor('G', 'Green tile (g)'));
    $toolbar.append(makeColor('B', 'Blue tile (b)'));
    $toolbar.append(makeItem('erase', 'Erase (x)'));
    $toolbar.append(makeItem('star', 'Star (s)'));
    $toolbar.append(makeRobot(0, 'Robot right'));
    $toolbar.append(makeRobot(1, 'Robot down'));
    $toolbar.append(makeRobot(2, 'Robot left'));
    $toolbar.append(makeRobot(3, 'Robot up'));
};

robozzle.encodeDesign = function (level) {
    var encodeState = {
        output: '',
        val: 0,
        bits: 0
    };
    var i, j;

    robozzle.encodeBits(encodeState, 0, 3); // Version number = 0
    for (j = 0; j < level.Colors.length; j++) {
        var colors = level.Colors[j];
        var items = level.Items[j];
        for (i = 0; i < colors.length; i++) {
            var val = 0;
            if (items.charAt(i) != '#') {
                if (colors.charAt(i) == 'R') {
                    val = 1;
                } else if (colors.charAt(i) == 'G') {
                    val = 2;
                } else if (colors.charAt(i) == 'B') {
                    val = 3;
                }
                if (items.charAt(i) == '*') {
                    val = val + 3;
                }
            }
            robozzle.encodeBits(encodeState, val, 3);
        }
    }
    robozzle.encodeBits(encodeState, level.RobotRow, 4);
    robozzle.encodeBits(encodeState, level.RobotCol, 4);
    robozzle.encodeBits(encodeState, level.RobotDir, 2);
    for (i = 0; i < level.SubLengths.length; i++) {
        robozzle.encodeBits(encodeState, level.SubLengths[i], 4);
    }
    robozzle.encodeBits(encodeState, level.AllowedCommands, 3);

    robozzle.encodeBits(encodeState, 0, 5); // Flush
    return encodeState.output;
};

robozzle.decodeDesign = function (input) {
    if (!input) {
        return null;
    }

    var decodeState = {
        input: input,
        index: 0,
        val: 0,
        bits: 0
    };
    var i, j;

    var version = robozzle.decodeBits(decodeState, 3);
    if (version != 0) {
        return null;
    }

    var level = {
        Colors: [],
        Items: [],
        SubLengths: []
    };

    for (j = 0; j < 12; j++) {
        var colors = '';
        var items = '';
        for (i = 0; i < 16; i++) {
            var val = robozzle.decodeBits(decodeState, 3);
            if (val == 0) {
                colors += 'B';
                items += '#';
            } else {
                if (val > 3) {
                    items += '*';
                    val = val - 3;
                } else {
                    items += '.';
                }
                if (val == 1) {
                    colors += 'R';
                } else if (val == 2) {
                    colors += 'G';
                } else if (val == 3) {
                    colors += 'B';
                } else {
                    return null;
                }
            }
        }
        level.Colors.push(colors);
        level.Items.push(items);
    }
    level.RobotRow = robozzle.decodeBits(decodeState, 4);
    level.RobotCol = robozzle.decodeBits(decodeState, 4);
    level.RobotDir = robozzle.decodeBits(decodeState, 2);
    for (i = 0; i < 5; i++) {
        level.SubLengths.push(robozzle.decodeBits(decodeState, 4));
    }
    level.AllowedCommands = robozzle.decodeBits(decodeState, 3);
    level.Title = '';
    level.About = '';

    return level;
};

robozzle.submitDesign = function (callback) {
    if (!robozzle.design) {
        callback('Invalid puzzle.');
        return;
    }

    if (!robozzle.design.Title) {
        callback('The puzzle title cannot be blank.');
        return;
    }

    if (!robozzle.userName || !robozzle.password) {
        callback('You must sign in to submit puzzles.');
        return;
    }

    var request = {
        level2: {
            About: robozzle.design.About,
            AllowedCommands: robozzle.design.AllowedCommands,
            Colors: robozzle.design.Colors,
            Items: robozzle.design.Items,
            RobotCol: robozzle.design.RobotCol,
            RobotDir: robozzle.design.RobotDir,
            RobotRow: robozzle.design.RobotRow,
            SubLengths: robozzle.design.SubLengths,
            Title: robozzle.design.Title
        },
        userName: robozzle.userName,
        pwd: robozzle.password,
        solution: robozzle.encodeSolution()
    };
    robozzle.service('SubmitLevel2', request, function (result, response) {
        callback(result);
    }, function () {
        callback('Server request failed.');
    });
};

robozzle.defaultDesign = function () {
    var level = {};
    level.Colors = [
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        "BBBBBBBBBBBBBBBB",
        ];
    level.Items = [
        "################",
        "################",
        "################",
        "################",
        "################",
        "#######..#######",
        "#######.*#######",
        "################",
        "################",
        "################",
        "################",
        "################",
        ];
    level.RobotDir = 0;
    level.RobotCol = 7;
    level.RobotRow = 6;
    level.AllowedCommands = 0;
    level.SubLengths = [ 10, 10, 10, 10, 10 ];
    level.Title = '';
    level.About = '';
    return level;
};

robozzle.readDesign = function () {
    var level = {
        Colors: [],
        Items: [],
        SubLengths: []
    };
    var i, j;

    for (j = 0; j < robozzle.board.length; j++) {
        var colors = '';
        var items = '';
        var row = robozzle.board[j];
        for (i = 0; i < row.length; i++) {
            var $cell = row[i];

            var color = $cell.getClass('board-color');
            if (!color) {
                colors += 'B';
                items += '#';
            } else {
                colors += color;

                var $item = $cell.find('.item');
                if ($item.hasClass('board-star')) {
                    items += '*';
                } else {
                    items += '.';
                }
            }
        }
        level.Colors.push(colors);
        level.Items.push(items);
    }
    level.RobotDir = robozzle.robotDir;
    level.RobotCol = robozzle.robotCol;
    level.RobotRow = robozzle.robotRow;
    level.AllowedCommands = 0;
    if ($('#design-red').prop('checked')) {
        level.AllowedCommands += 1;
    }
    if ($('#design-green').prop('checked')) {
        level.AllowedCommands += 2;
    }
    if ($('#design-blue').prop('checked')) {
        level.AllowedCommands += 4;
    }
    for (i = 0; i < 5; i++) {
        level.SubLengths.push(parseInt($('#design-f' + (i + 1)).val()));
    }
    level.Title = $('#design-title').val();
    level.About = $('#design-about').val();;
    return level;
};

robozzle.displayDesign = function () {
    robozzle.setPageTab('makepuzzle');
    $('#content-game').show();
    $('#content-game').children().hide();
    $('#board-container').show();
    $('#design-toolbar-container').show();
    $('#design-panel-container').show();
    $('#design-selection').show();

    var status = $('#statusbar');
    status.find('span.title').text("Designing a puzzle");
    status.find('div.about').text("Design a puzzle, solve it, and then submit it to challenge others.").show();
    status.find('a.stats').hide();
    status.find('a.comments').hide();

    if (!robozzle.design) {
        robozzle.design = robozzle.defaultDesign();
    }
    robozzle.displayBoard(robozzle.design);
    robozzle.displayProgram(robozzle.design, robozzle.designProgram);
    $('#design-title').val(robozzle.design.Title);
    $('#design-about').val(robozzle.design.About);
    for (var i = 0; i < 5; i++) {
        $('#design-f' + (i + 1)).val(robozzle.design.SubLengths[i]);
    }
    $('#design-red').prop('checked', robozzle.design.AllowedCommands & 1);
    $('#design-green').prop('checked', robozzle.design.AllowedCommands & 2);
    $('#design-blue').prop('checked', robozzle.design.AllowedCommands & 4);
    robozzle.displayDesignToolbar();
};

robozzle.moveRobot = function () {
    var crash = false;
    var col = robozzle.robotCol;
    var row = robozzle.robotRow;
    if (robozzle.robotDir == 0) {
        col++;
        if (col >= robozzle.level.Colors[0].length)
            crash = true;
    } else if (robozzle.robotDir == 1) {
        row++;
        if (row >= robozzle.level.Colors.length)
            crash = true;
    } else if (robozzle.robotDir == 2) {
        col--;
        if (col < 0)
            crash = true;
    } else if (robozzle.robotDir == 3) {
        row--;
        if (row < 0)
            crash = true;
    }
    if (!crash) {
        robozzle.robotCol = col;
        robozzle.robotRow = row;

        var $cell = robozzle.board[row][col];
        var color = $cell.getClass('board-color');
        if (!color)
            crash = true;

        var $item = $cell.find('.item');
        if ($item.hasClass('board-star')) {
            $item.animate({ opacity: 0 }, robozzle.robotDelay)
                .removeClass('board-star')
                .addClass('board-star-fade');
            robozzle.stars--;
        }
    }
    robozzle.animateRobot({ left: col * 40, top: row * 40 });
    if (crash) {
        robozzle.animateRobot({ scale: 0.0 });
        robozzle.setRobotState(robozzle.robotStates.finished);
    }
};

robozzle.turnRobot = function (right) {
    var dir = robozzle.robotDir;
    if (right) {
        dir++;
        robozzle.robotDeg += 90;
    } else {
        dir--;
        robozzle.robotDeg -= 90;
    }
    robozzle.robotDir = (dir + 4) % 4;
    robozzle.animateRobot({ deg: robozzle.robotDeg });
};

robozzle.callSub = function (calls, sub) {
    if (calls & (1 << sub)) {
        // Infinite loop
        robozzle.setRobotState(robozzle.robotStates.finished);
        return;
    }
    calls |= 1 << sub;
    robozzle.stack.unshift({ sub: sub, cmd: 0 });
    robozzle.stepExecute(calls);
};

robozzle.stepReset = function () {
    if (robozzle.robotState != robozzle.robotStates.reset) {
        $(robozzle.robotAnimation).stop(true, false);
        robozzle.displayBoard(robozzle.level);
    }
};

robozzle.stepWait = function () {
    if (robozzle.robotState == robozzle.robotStates.finished) {
        return;
    }
    if (robozzle.starsMax > 0 && robozzle.stars == 0) {
        $(robozzle.robotAnimation).queue(function () {
            if (robozzle.level.Id) {
                robozzle.submitSolution();
                robozzle.showSolved();
            } else {
                robozzle.showDesignSolved();
            }
            $(this).dequeue();
        });
        robozzle.setRobotState(robozzle.robotStates.finished);
        return;
    }
    robozzle.steps++;
    if (robozzle.steps >= 1000) {
        $(robozzle.robotAnimation).queue(function () {
            robozzle.showMessage('Out of fuel!',
                                 'You must solve the puzzle in at most 1000 steps.');
            $(this).dequeue();
        });
        robozzle.setRobotState(robozzle.robotStates.finished);
        return;
    }
    $(robozzle.robotAnimation).queue(function () {
        $(this).dequeue();
        if (robozzle.robotState == robozzle.robotStates.started) {
            robozzle.stepExecute(0);
        } else if (robozzle.robotState == robozzle.robotStates.stepping) {
            robozzle.setRobotState(robozzle.robotStates.stopped);
        }
    });
};

robozzle.stepExecute = function (calls) {
    var $cmd = robozzle.program[robozzle.stack[0].sub][robozzle.stack[0].cmd];
    if (!$cmd) {
        robozzle.stack.shift();
        if (robozzle.stack.length) {
            robozzle.stepExecute(calls);
        } else {
            robozzle.setRobotState(robozzle.robotStates.finished);
        }
        return;
    }
    var cond = $cmd.getClass('condition');
    var cmd = $cmd.find('.command').getClass('command');
    var $cell = robozzle.board[robozzle.robotRow][robozzle.robotCol];
    var color = $cell.getClass('board-color');
    robozzle.stack[0].cmd++;
    if (cond == 'any' || cond == color) {
        switch (cmd) {
        case 'f': robozzle.moveRobot(); robozzle.stepWait(); break;
        case 'l': robozzle.turnRobot(false); robozzle.stepWait(); break;
        case 'r': robozzle.turnRobot(true); robozzle.stepWait(); break;
        case '1': robozzle.callSub(calls, 0); break;
        case '2': robozzle.callSub(calls, 1); break;
        case '3': robozzle.callSub(calls, 2); break;
        case '4': robozzle.callSub(calls, 3); break;
        case '5': robozzle.callSub(calls, 4); break;
        case 'R': $cell.updateClass('board-color', 'R'); robozzle.stepWait(); break;
        case 'G': $cell.updateClass('board-color', 'G'); robozzle.stepWait(); break;
        case 'B': $cell.updateClass('board-color', 'B'); robozzle.stepWait(); break;
        }
    } else {
        robozzle.stepExecute(calls);
    }
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
                robozzle.solvedLevels[parseInt(value)] = true;
            });
            robozzle.likeVotes = {};
            robozzle.difficultyVotes = {};
            $.each(response.votes.LevelVoteInfo, function (index, value) {
                if (value.VoteKind === '0') {
                    robozzle.likeVotes[value.LevelId] = value.Vote;
                } else if (value.VoteKind === '1') {
                    robozzle.difficultyVotes[value.LevelId] = value.Vote;
                }
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
    if (robozzle.logInCallbacks) {
        robozzle.logInCallbacks.empty();
    }
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

robozzle.showDialog = function ($dialog) {
    $('#dialog-modal').show();
    $('#dialogs').show();
    $dialog.show();
    $dialog.find(":input:first").focus();
    // TODO: prevent focus leaving the dialog
};

robozzle.hideDialog = function ($dialog) {
    $dialog.hide();
    $('#dialogs').hide();
    $('#dialog-modal').hide();
};

robozzle.showMessage = function (title, message) {
    var $dialog = $('#dialog-message');
    $dialog.find('.dialog-title').text(title);
    $dialog.find('.dialog-message').text(message);
    robozzle.showDialog($dialog);
};

robozzle.submitMessage = function (event) {
    event.preventDefault();
    robozzle.hideDialog($('#dialog-message'));
};

robozzle.initMessage = function () {
    $('#dialog-message').find('form').on('submit', robozzle.submitMessage);
};

robozzle.showSignin = function () {
    var $signin = $('#dialog-signin');
    $signin.find(':input').prop('disabled', false);
    $('#dialog-signin-error').hide();
    robozzle.showDialog($signin);
};

robozzle.hideSignin = function () {
    var $signin = $('#dialog-signin');
    robozzle.hideDialog($signin);
    $signin.find('input[name="password"]').val('');
};

robozzle.submitSignin = function (event) {
    event.preventDefault();
    var $signin = $('#dialog-signin');
    $signin.find(':input').prop('disabled', true);
    $('#dialog-signin-cancel').prop('disabled', false);
    robozzle.logIn(
            $signin.find('input[name="name"]').val(),
            robozzle.hashPassword($signin.find('input[name="password"]').val()),
            function (result) {
                $signin.find(':input').prop('disabled', false);
                if (result) {
                    robozzle.hideSignin();
                } else {
                    $('#dialog-signin-error').show();
                }
            });
};

robozzle.cancelSignin = function (event) {
    event.preventDefault();
    robozzle.logInCancel();
    robozzle.hideSignin();
};

robozzle.initSignin = function () {
    $('#dialog-signin').find('form').on('submit', robozzle.submitSignin);
    $('#dialog-signin-cancel').on('click', robozzle.cancelSignin);
};

robozzle.displaySolvedVote = function () {
    var text = $('#dialog-solved-difficulty input:checked + label span').first().text();
    if (text) {
        text = 'Your vote: ' + text;
    } else {
        text = 'Please vote on the difficulty';
    }
    $('#dialog-solved-difficulty-label').text(text);
};

robozzle.showSolved = function () {
    var $solved = $('#dialog-solved');
    if (robozzle.userName) {
        $('#dialog-solved-difficulty').find('input').prop('checked', false);
        var vote = robozzle.difficultyVotes[robozzle.level.Id];
        var $difficulty = $('#dialog-solved-difficulty');
        if (vote) {
            $difficulty.find('input[value="' + vote + '"]').prop('checked', true);
            $difficulty.find('.difficulty-val').updateClass('difficulty-val', 'user');
        } else {
            robozzle.displayDifficulty(robozzle.level, $difficulty);
        }

        $('#dialog-solved-like').prop('checked', false);
        $('#dialog-solved-dislike').prop('checked', false);
        vote = robozzle.likeVotes[robozzle.level.Id];
        if (vote == '1') {
            $('#dialog-solved-like').prop('checked', true);
        } else if (vote == '-1') {
            $('#dialog-solved-dislike').prop('checked', true);
        }

        robozzle.displaySolvedVote();

        $solved.find('span.liked').text('+' + robozzle.level.Liked);
        $solved.find('span.disliked').text('-' + robozzle.level.Disliked);

        $('#dialog-solved-message').hide();
        $('#dialog-solved-form').show();
    } else {
        $('#dialog-solved-message').show();
        $('#dialog-solved-form').hide();
    }
    $solved.find('a.stats')
        .attr('href', 'puzzle.aspx?id=' + robozzle.level.Id)
        .attr('target', '_blank');
    $solved.find('a.comments')
        .attr('href', 'forums/thread.aspx?puzzle=' + robozzle.level.Id)
        .attr('target', '_blank');
    robozzle.showDialog($solved);
};

robozzle.submitSolved = function (event) {
    event.preventDefault();
    robozzle.hideDialog($('#dialog-solved'));
    robozzle.submitLevelVote();
    robozzle.navigateIndex();
};

robozzle.cancelSolved = function (event) {
    event.preventDefault();
    robozzle.hideDialog($('#dialog-solved'));
    robozzle.submitLevelVote();
};

robozzle.initSolved = function () {
    $('#dialog-solved').find('form').on('submit', robozzle.submitSolved);
    $('#dialog-solved-replay').on('click', robozzle.cancelSolved);
    $('#dialog-solved-difficulty label').mouseenter(function () {
        $('#dialog-solved-difficulty-label').text($(this).find('span').text());
    }).mouseleave(function () {
        robozzle.displaySolvedVote();
    });
    $('input[name="difficulty"]').change(function () {
        $('#dialog-solved-difficulty').find('.difficulty-val').updateClass('difficulty-val', 'user');
        robozzle.displaySolvedVote();
    });
    $('#dialog-solved-like').change(function () {
        if ($(this).prop('checked')) {
            $('#dialog-solved-dislike').prop('checked', false);
        }
    });
    $('#dialog-solved-dislike').change(function () {
        if ($(this).prop('checked')) {
            $('#dialog-solved-like').prop('checked', false);
        }
    });
};

robozzle.showDesignSolved = function () {
    var $dialog = $('#dialog-design-solved');
    $dialog.find(':input').prop('disabled', false);
    $('#dialog-design-solved-error').hide();
    robozzle.showDialog($dialog);
};

robozzle.submitDesignSolved = function (event) {
    event.preventDefault();
    var $dialog = $('#dialog-design-solved');
    $dialog.find(':input').prop('disabled', true);
    $('#dialog-design-solved-edit').prop('disabled', false);
    robozzle.submitDesign(
            function (result) {
                $dialog.find(':input').prop('disabled', false);
                if (result === null) {
                    robozzle.hideDialog($dialog);
                    robozzle.navigateIndex();
                } else {
                    $('#dialog-design-solved-error').text(result).show();
                }
            });
};

robozzle.cancelDesignSolved = function (event) {
    event.preventDefault();
    robozzle.hideDialog($('#dialog-design-solved'));
};

robozzle.initDesignSolved = function () {
    $('#dialog-design-solved').find('form').on('submit', robozzle.submitDesignSolved);
    $('#dialog-design-solved-edit').on('click', robozzle.cancelDesignSolved);
};

robozzle.parseUrl = function () {
    var urlParams = {};
    var query = window.location.search.substring(1);
    var search = /([^&=]+)=?([^&]*)/g;
    var decode = function (s) { return decodeURIComponent(s.replace(/\+/g, " ")); };
    var match;
    while (match = search.exec(query)) {
       urlParams[decode(match[1])] = decode(match[2]);
    }

    if ('puzzle' in urlParams) {
        robozzle.setGame(urlParams['puzzle'], robozzle.decodeProgram(urlParams['program']));
    } else if ('design' in urlParams) {
        robozzle.designProgram = robozzle.decodeProgram(urlParams['program']);
        robozzle.design = robozzle.decodeDesign(urlParams['design']);
        robozzle.displayDesign();
    } else {
        robozzle.getLevels(false);
    }
};

robozzle.navigateUrl = function (url) {
    if (robozzle.urlTimeout) {
        window.clearTimeout(robozzle.urlTimeout);
        robozzle.urlCallback();
        robozzle.urlTimeout = null;
        robozzle.urlCallback = null;
    }

    history.pushState({ }, "", url);
    robozzle.parseUrl();
};

robozzle.setUrl = function (callback) {
    if (robozzle.urlTimeout) {
        window.clearTimeout(robozzle.urlTimeout);
    }
    robozzle.urlCallback = function () {
        history.replaceState({ }, "", callback());
    };
    robozzle.urlTimeout = window.setTimeout(function () {
        robozzle.urlCallback();
        robozzle.urlTimeout = null;
        robozzle.urlCallback = null;
    }, 1000);
};

robozzle.navigateIndex = function () {
    robozzle.navigateUrl("index.html");
};

robozzle.navigatePuzzle = function (id) {
    robozzle.navigateUrl("index.html?puzzle=" + id);
};

robozzle.navigateDesign = function () {
    robozzle.navigateUrl("index.html?design=");
};

robozzle.setPuzzleUrl = function (id, program) {
    robozzle.setUrl(function () {
        return "index.html?puzzle=" + id + "&program=" + program();
    });
};

robozzle.setDesignUrl = function (design, program) {
    robozzle.setUrl(function () {
        return "index.html?design=" + design() + '&program=' + program();
    });
};

robozzle.setPageTab = function (name) {
    $('.page-menu__item').removeClass('page-menu__item--active');
    $('.page-content__tab').hide();
    if (name) {
        $('#menu-' + name).addClass('page-menu__item--active');
        $('#content-' + name).show();
    }
};

$(document).ready(function () {
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
    $('.level-menu__item').click(function () {
        robozzle.setSortKind(parseInt($(this).attr('data-kind')));
        robozzle.getLevels(true);
    });
    $('#menu-levels').click(function () {
        robozzle.navigateIndex();
    });
    $('#menu-makepuzzle').click(function () {
        robozzle.navigateDesign();
    });
    $('#program-go').click(function () {
        if (robozzle.robotState == robozzle.robotStates.reset
                || robozzle.robotState == robozzle.robotStates.stopped) {
            robozzle.setRobotState(robozzle.robotStates.started);
            robozzle.stepExecute(0);
        } else if (robozzle.robotState == robozzle.robotStates.stepping) {
            robozzle.setRobotState(robozzle.robotStates.started);
        } else {
            robozzle.stepReset();
        }
    });
    $('#program-step').click(function () {
        if (robozzle.robotState == robozzle.robotStates.reset
                || robozzle.robotState == robozzle.robotStates.stopped) {
            robozzle.setRobotState(robozzle.robotStates.stepping);
            robozzle.stepExecute(0);
        } else if (robozzle.robotState == robozzle.robotStates.started) {
            robozzle.robotState = robozzle.robotStates.stepping;
        }
    });
    $('#design-solve').click(function () {
        robozzle.design = robozzle.readDesign();
        robozzle.displayGame(robozzle.design, robozzle.designProgram);
    });
    $('#program-edit').click(function () {
        robozzle.designProgram = robozzle.readProgram();
        robozzle.displayDesign();
    });
    $('#program-container, #program-toolbar').on('mousemove', function (e) {
        robozzle.hoverSelection(null, null);
        robozzle.moveSelection(null, e.pageX - 15, e.pageY - 15);
    });
    $('#board-container, #design-toolbar').on('mousemove', function (e) {
        robozzle.hoverDesignSelection(null);
        robozzle.moveDesignSelection(null, e.pageX - 15, e.pageY - 15);
    });
    $(document).click(function () {
        robozzle.hideSelection();
        robozzle.hideDesignSelection();
    });
    $(document).on('keydown', null, 'r', function () {
        robozzle.setSelection('R', null);
        robozzle.setDesignSelection('R', null, null);
    });
    $(document).on('keydown', null, 'g', function () {
        robozzle.setSelection('G', null);
        robozzle.setDesignSelection('G', null, null);
    });
    $(document).on('keydown', null, 'b', function () {
        robozzle.setSelection('B', null);
        robozzle.setDesignSelection('B', null, null);
    });
    $(document).on('keydown', null, 'n', function () {
        robozzle.setSelection('any', null);
    });
    $(document).on('keydown', null, 'q', function () {
        robozzle.setSelection(null, 'l');
    });
    $(document).on('keydown', null, 'w', function () {
        robozzle.setSelection(null, 'f');
    });
    $(document).on('keydown', null, 'e', function () {
        robozzle.setSelection(null, 'r');
    });
    $(document).on('keydown', null, '1', function () {
        robozzle.setSelection(null, '1');
    });
    $(document).on('keydown', null, '2', function () {
        robozzle.setSelection(null, '2');
    });
    $(document).on('keydown', null, '3', function () {
        robozzle.setSelection(null, '3');
    });
    $(document).on('keydown', null, '4', function () {
        robozzle.setSelection(null, '4');
    });
    $(document).on('keydown', null, '5', function () {
        robozzle.setSelection(null, '5');
    });
    $(document).on('keydown', null, 'shift+r', function () {
        robozzle.setSelection(null, 'R');
    });
    $(document).on('keydown', null, 'shift+g', function () {
        robozzle.setSelection(null, 'G');
    });
    $(document).on('keydown', null, 'shift+b', function () {
        robozzle.setSelection(null, 'B');
    });
    $(document).on('keydown', null, 's', function () {
        robozzle.setDesignSelection(null, 'star', null);
    });
    $(document).on('keydown', null, 'x', function () {
        robozzle.setDesignSelection(null, 'erase', null);
    });

    robozzle.initMessage();
    robozzle.initSignin();
    robozzle.initSolved();
    robozzle.initDesignSolved();

    $('#menu-signin').on('click', robozzle.showSignin);
    $('#menu-signout').on('click', robozzle.logOut);

    var hideSolved = localStorage.getItem('hideSolved');
    if (hideSolved != null) {
        robozzle.hideSolved = hideSolved === 'true';
        $('#hidesolved').prop('checked', robozzle.hideSolved);
    }

    robozzle.robotSpeed = localStorage.getItem('robotSpeed');
    if (robozzle.robotSpeed === null) {
        robozzle.robotSpeed = 5;
    }
    // 0 -> 1020, 5 -> 145, 10 -> 20
    robozzle.robotDelay = Math.pow(10 - robozzle.robotSpeed, 3) + 20;
    $('#program-speed').val(robozzle.robotSpeed).change(function () {
        robozzle.robotSpeed = parseInt($(this).val());
        robozzle.robotDelay = Math.pow(10 - robozzle.robotSpeed, 3) + 20;
        localStorage.setItem('robotSpeed', robozzle.robotSpeed);
    });

    window.onpopstate = robozzle.parseUrl;

    robozzle.setPageTab('levels');
    robozzle.setSortKind(0);

    var userName = localStorage.getItem('userName');
    var password = localStorage.getItem('password');
    if (userName !== null && password !== null) {
        var spinner = new Spinner().spin($('#levellist-spinner')[0]);
        robozzle.logIn(userName, password, function (result) {
            spinner.stop();
            robozzle.parseUrl();
            robozzle.topSolvers();
        });
    } else {
        robozzle.parseUrl();
        robozzle.topSolvers();
    }
});
