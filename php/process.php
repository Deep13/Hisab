<?php
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Whitelist of allowed methods to prevent Remote Code Execution
$allowedMethods = [
    'getAllLabours',
    'getAllClients',
    'getAllClientsWithParam',
    'getAllLabourWithParam',
    'getClientInvoice',
    'getAllTransaction',
    'getClientTransaction',
    'getLabourTransaction',
    'getRoutine',
    'getServiceMaster',
    'getService',
    'setServiced',
    'insertService',
    'updateTrans',
    'onCreateLabor',
    'onUpdateClient',
    'onCreateClient',
    'onCreateATransaction',
    'getKhazana',
    'getLabourAnalytics',
    'getProfitLoss',
    'insertProfitLoss',
    'getOffices',
    'getMachines',
    'createMachine',
    'getMachineExpenses',
    'insertMachineExpense',
    'getMachineExpenseReport'
];

$method = isset($_POST["method"]) ? $_POST["method"] : '';

if (!in_array($method, $allowedMethods, true)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid method"]);
    exit;
}

echo $method();

// --- Database Connection ---

function getDbConnection() {
    static $conn = null;
    if ($conn === null || !$conn->ping()) {
        $servername = "localhost";
        $username = "root";
        $password = "";
        $dbname = "hisabkitab";
        // Suppress mysqli throwing exceptions; we handle errors via return codes
        mysqli_report(MYSQLI_REPORT_OFF);
        $conn = new mysqli($servername, $username, $password, $dbname);
        if ($conn->connect_error) {
            http_response_code(500);
            echo json_encode(["error" => "Database connection failed"]);
            exit;
        }
        $conn->set_charset("utf8mb4");
    }
    return $conn;
}

function fetchAll($result) {
    $data = [];
    while ($row = $result->fetch_assoc()) {
        $data[] = $row;
    }
    return $data;
}

function getPostData() {
    if (!isset($_POST["data"])) {
        return null;
    }
    $obj = json_decode($_POST["data"]);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid JSON data"]);
        exit;
    }
    return $obj;
}

// --- API Functions ---

function getAllLabours() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM masterlabor");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getAllClients() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM masterclient ORDER BY client ASC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getAllClientsWithParam() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;
    $machineType = $obj->machineType;
    $officeType = $obj->officeType;

    $conditions = ["month = ?", "year = ?"];
    $types = "ss";
    $params = [$month, $year];

    if ($machineType !== "All") {
        $conditions[] = "machineType = ?";
        $types .= "s";
        $params[] = $machineType;
    } else {
        $conditions[] = "machineType != ''";
    }

    if ($officeType !== "All") {
        $conditions[] = "cc = ?";
        $types .= "s";
        $params[] = $officeType;
    } else {
        $conditions[] = "cc != ''";
    }

    $sql = "SELECT DISTINCT client FROM transaction WHERE " . implode(" AND ", $conditions) . " ORDER BY client ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getAllLabourWithParam() {
    $conn = getDbConnection();
    $obj = getPostData();
    $officeType = $obj->officeType;

    if ($officeType !== "All") {
        $stmt = $conn->prepare("SELECT DISTINCT labour FROM transaction WHERE cc = ? ORDER BY labour ASC");
        $stmt->bind_param("s", $officeType);
    } else {
        $stmt = $conn->prepare("SELECT DISTINCT labour FROM transaction WHERE cc != '' ORDER BY labour ASC");
    }

    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getClientInvoice() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;
    $machineType = $obj->machineType;
    $officeType = $obj->officeType;
    $Client = $obj->Client;

    $conditions = ["month = ?", "year = ?", "machineType != 'Thokai'"];
    $types = "ss";
    $params = [$month, $year];

    if ($officeType !== "All") {
        $conditions[] = "cc = ?";
        $types .= "s";
        $params[] = $officeType;
    } else {
        $conditions[] = "cc != ''";
    }

    if ($Client !== "All") {
        $conditions[] = "client = ?";
        $types .= "s";
        $params[] = $Client;
    } else {
        $conditions[] = "client != ''";
    }

    $sql = "SELECT * FROM transaction WHERE " . implode(" AND ", $conditions) . " ORDER BY machineType ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getAllTransaction() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM transaction ORDER BY `year` DESC, `month` DESC, `date` DESC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getClientTransaction() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;
    $machineType = $obj->machineType;
    $officeType = $obj->officeType;
    $Client = $obj->Client;

    $conditions = ["month = ?", "year = ?"];
    $types = "ss";
    $params = [$month, $year];

    if ($machineType !== "All") {
        $conditions[] = "machineType = ?";
        $types .= "s";
        $params[] = $machineType;
    } else {
        $conditions[] = "machineType != ''";
    }

    if ($officeType !== "All") {
        $conditions[] = "cc = ?";
        $types .= "s";
        $params[] = $officeType;
    } else {
        $conditions[] = "cc != ''";
    }

    if ($Client !== "All") {
        $conditions[] = "client = ?";
        $types .= "s";
        $params[] = $Client;
    } else {
        $conditions[] = "client != ''";
    }

    $sql = "SELECT * FROM transaction WHERE " . implode(" AND ", $conditions) . " ORDER BY `year` DESC, `month` DESC, `date` DESC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getLabourTransaction() {
    $conn = getDbConnection();
    $obj = getPostData();
    $name = $obj->Labour;
    $officeType = $obj->office;
    $start = $obj->start;
    $end = $obj->end;

    $conditions = ["labour = ?", "str_to_date(date, '%d/%m/%Y') BETWEEN ? AND ?"];
    $types = "sss";
    $params = [$name, $start, $end];

    if ($officeType !== "All") {
        $conditions[] = "cc = ?";
        $types .= "s";
        $params[] = $officeType;
    } else {
        $conditions[] = "cc != ''";
    }

    $sql = "SELECT * FROM transaction WHERE " . implode(" AND ", $conditions) . " ORDER BY `year` ASC, `month` ASC, `date` ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getRoutine() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM routine ORDER BY Name ASC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getServiceMaster() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT DISTINCT machineName, cc, max(servicedOn) as servicedOn FROM service GROUP BY machineName, cc ORDER BY cc ASC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getService() {
    $conn = getDbConnection();
    $obj = getPostData();
    $machineName = $obj->machineName;
    $cc = $obj->cc;

    $stmt = $conn->prepare("SELECT * FROM service WHERE `machineName` = ? AND `cc` = ? ORDER BY servicedOn DESC");
    $stmt->bind_param("ss", $machineName, $cc);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function setServiced() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = (int)$obj->id;
    $ServiceOn = $obj->ServicedOn;

    $stmt = $conn->prepare("UPDATE `routine` SET `ServicedOn` = ? WHERE `id` = ?");
    $stmt->bind_param("si", $ServiceOn, $id);

    if ($stmt->execute()) {
        return json_encode(["Update successful"]);
    }
    return json_encode(["Update failed"]);
}

function insertService() {
    $conn = getDbConnection();
    $obj = getPostData();
    $cc = $obj->cc;
    $servicedOn = $obj->servicedOn;
    $serviceName = $obj->serviceName;
    $machineName = $obj->machineName;
    $amount = (float)$obj->Amount;
    $type = $obj->type;

    $stmt = $conn->prepare("INSERT INTO service(cc, servicedOn, serviceName, machineName, type, Amount) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sssssd", $cc, $servicedOn, $serviceName, $machineName, $type, $amount);

    if ($stmt->execute()) {
        return json_encode(["Insertion successful"]);
    }
    return json_encode(["Insertion failed"]);
}

function updateTrans() {
    $conn = getDbConnection();
    $obj = getPostData();
    $client = $obj->client;
    $dateTime = $obj->dateTime;
    $labour = $obj->labour;
    $date = $obj->date;
    $month = $obj->month;
    $year = $obj->year;
    $cc = $obj->cc;
    $rate = (float)$obj->rate;
    $quantity = (int)$obj->quantity;
    $machineType = $obj->machineType;
    $total = (float)$obj->total;

    $stmt = $conn->prepare("UPDATE `transaction` SET `date` = ?, `client` = ?, `cc` = ?, `rate` = ?, `total` = ?, `labour` = ?, `quantity` = ?, `machineType` = ?, `month` = ?, `year` = ? WHERE `dateTime` = ?");
    $stmt->bind_param("sssddsissss", $date, $client, $cc, $rate, $total, $labour, $quantity, $machineType, $month, $year, $dateTime);

    if ($stmt->execute()) {
        return json_encode(["Update successful"]);
    }
    return json_encode(["Update failed"]);
}

function onCreateLabor() {
    $conn = getDbConnection();
    $obj = getPostData();
    $Labor = $obj->Labor;
    $id = $obj->id;

    $stmt = $conn->prepare("INSERT INTO masterlabor(id, Labor) VALUES (?, ?)");
    $stmt->bind_param("ss", $id, $Labor);

    if ($stmt->execute()) {
        return json_encode(["Insertion successful"]);
    }
    return json_encode(["Insertion failed"]);
}

function onUpdateClient() {
    $conn = getDbConnection();
    $obj = getPostData();
    $Client = $obj->client;
    $NewName = $obj->newname;

    $conn->begin_transaction();

    $stmt1 = $conn->prepare("UPDATE `masterclient` SET `client` = ? WHERE `client` = ?");
    $stmt1->bind_param("ss", $NewName, $Client);

    if (!$stmt1->execute()) {
        $conn->rollback();
        return json_encode(["Master update failed"]);
    }

    $stmt2 = $conn->prepare("UPDATE `transaction` SET `client` = ? WHERE `client` = ?");
    $stmt2->bind_param("ss", $NewName, $Client);

    if (!$stmt2->execute()) {
        $conn->rollback();
        return json_encode(["Transaction update failed"]);
    }

    $conn->commit();
    return json_encode(["Update successful"]);
}

function onCreateClient() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = $obj->id;
    $Client = $obj->Client;

    $stmt = $conn->prepare("INSERT INTO masterclient(id, client) VALUES (?, ?)");
    $stmt->bind_param("ss", $id, $Client);

    if ($stmt->execute()) {
        return json_encode(["Insertion successful"]);
    }
    return json_encode(["Insertion failed"]);
}

function onCreateATransaction() {
    $conn = getDbConnection();
    $obj = getPostData();
    $client = $obj->client;
    $labour = $obj->labour;
    $date = $obj->date;
    $month = $obj->month;
    $year = $obj->year;
    $cc = $obj->cc;
    $rate = (float)$obj->rate;
    $quantity = (int)$obj->quantity;
    $machineType = $obj->machineType;
    $total = (float)$obj->total;

    $stmt = $conn->prepare("INSERT INTO transaction(date, client, labour, cc, rate, quantity, machineType, total, month, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("ssssdisdss", $date, $client, $labour, $cc, $rate, $quantity, $machineType, $total, $month, $year);

    if ($stmt->execute()) {
        return json_encode(["Insertion successful"]);
    }
    return json_encode(["Insertion failed"]);
}

function getKhazana() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;

    $stmt = $conn->prepare("SELECT * FROM khazana WHERE month = ? AND year = ? ORDER BY `year` ASC, `month` ASC");
    $stmt->bind_param("ss", $month, $year);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getLabourAnalytics() {
    $conn = getDbConnection();
    $obj = getPostData();
    $labour = $obj->labour;

    $stmt = $conn->prepare("SELECT * FROM transaction WHERE labour = ? ORDER BY `year` ASC, `month` ASC, `date` ASC");
    $stmt->bind_param("s", $labour);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getProfitLoss() {
    $conn = getDbConnection();
    $result = @$conn->query("SELECT * FROM profit_loss ORDER BY `year` DESC, `month` DESC");
    if (!$result) {
        // Table likely missing
        return json_encode([]);
    }
    if ($result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function insertProfitLoss() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;
    $shaving = (float)($obj->shaving ?? 0);
    $buffing = (float)($obj->buffing ?? 0);
    $charbi = (float)($obj->charbi ?? 0);
    $milling = (float)($obj->milling ?? 0);
    $tangan = (float)($obj->tangan ?? 0);
    $electricBill = (float)($obj->electricBill ?? 0);
    $munshi = (float)($obj->munshi ?? 0);
    $churi = (float)($obj->churi ?? 0);
    $mobil = (float)($obj->mobil ?? 0);
    $buffPaper = (float)($obj->buffPaper ?? 0);
    $bhussi = (float)($obj->bhussi ?? 0);
    $maintenance = (float)($obj->maintenance ?? 0);
    $vBelt = (float)($obj->vBelt ?? 0);
    $miscellaneous = (float)($obj->miscellaneous ?? 0);

    $stmt = @$conn->prepare(
        "INSERT INTO profit_loss (month, year, shaving, buffing, charbi, milling, tangan, electric_bill, munshi, churi, mobil, buff_paper, bhussi, maintenance, v_belt, miscellaneous)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            shaving = VALUES(shaving), buffing = VALUES(buffing), charbi = VALUES(charbi),
            milling = VALUES(milling), tangan = VALUES(tangan), electric_bill = VALUES(electric_bill),
            munshi = VALUES(munshi), churi = VALUES(churi), mobil = VALUES(mobil),
            buff_paper = VALUES(buff_paper), bhussi = VALUES(bhussi), maintenance = VALUES(maintenance),
            v_belt = VALUES(v_belt), miscellaneous = VALUES(miscellaneous)"
    );
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'profit_loss' does not exist. Please create it in the database."]);
    }
    $stmt->bind_param("ssdddddddddddddd",
        $month, $year, $shaving, $buffing, $charbi, $milling, $tangan,
        $electricBill, $munshi, $churi, $mobil, $buffPaper, $bhussi, $maintenance, $vBelt, $miscellaneous
    );

    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed"]);
}

// --- Machine master & machine expenses ---

/**
 * Offices to offer when creating a machine. Taken from the transaction data so
 * the list stays in sync with the rest of the app (Factory 01-04, Main ...).
 */
function getOffices() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT DISTINCT `cc` FROM `transaction` WHERE `cc` <> '' ORDER BY `cc` ASC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

/**
 * Machine master enriched with expense totals, so the list page can be filtered
 * and sorted on spend without a second round trip.
 */
function getMachines() {
    $conn = getDbConnection();
    $result = $conn->query(
        "SELECT m.id, m.cc, m.machineName, m.type, m.createdOn, m.active,
                COUNT(s.dateTime) AS expenseCount,
                COALESCE(SUM(s.Amount), 0) AS totalAmount,
                MIN(s.servicedOn) AS firstServicedOn,
                MAX(s.servicedOn) AS lastServicedOn
         FROM `machine` m
         LEFT JOIN `service` s ON s.cc = m.cc AND s.machineName = m.machineName
         GROUP BY m.id, m.cc, m.machineName, m.type, m.createdOn, m.active
         ORDER BY m.cc ASC, m.machineName ASC"
    );
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function createMachine() {
    $conn = getDbConnection();
    $obj = getPostData();
    $cc = trim($obj->cc ?? '');
    $machineName = trim($obj->machineName ?? '');
    $type = trim($obj->type ?? '');

    if ($cc === '' || $machineName === '' || $type === '') {
        return json_encode(["status" => "failed", "error" => "Office, machine name and type are required"]);
    }

    $stmt = $conn->prepare("SELECT `id` FROM `machine` WHERE `cc` = ? AND `machineName` = ?");
    $stmt->bind_param("ss", $cc, $machineName);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        return json_encode(["status" => "failed", "error" => "'" . $machineName . "' already exists in " . $cc]);
    }

    $stmt = $conn->prepare("INSERT INTO `machine` (`cc`, `machineName`, `type`, `createdOn`, `active`) VALUES (?, ?, ?, CURDATE(), 1)");
    $stmt->bind_param("sss", $cc, $machineName, $type);

    if ($stmt->execute()) {
        return json_encode(["status" => "success", "id" => $conn->insert_id]);
    }
    return json_encode(["status" => "failed", "error" => "Could not create machine"]);
}

function getMachineExpenses() {
    $conn = getDbConnection();
    $obj = getPostData();
    $cc = $obj->cc ?? '';
    $machineName = $obj->machineName ?? '';

    $stmt = $conn->prepare(
        "SELECT `dateTime`, `cc`, `machineName`, `type`, `servicedOn`, `serviceName`, `Amount`
         FROM `service`
         WHERE `cc` = ? AND `machineName` = ?
         ORDER BY `servicedOn` DESC"
    );
    $stmt->bind_param("ss", $cc, $machineName);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

/**
 * Records one expense against a machine. The machine type is taken from the
 * master rather than the client, so it cannot drift per expense row.
 */
function insertMachineExpense() {
    $conn = getDbConnection();
    $obj = getPostData();
    $cc = trim($obj->cc ?? '');
    $machineName = trim($obj->machineName ?? '');
    $serviceName = trim($obj->serviceName ?? '');
    $servicedOn = $obj->servicedOn ?? '';
    $amount = (float)($obj->Amount ?? 0);

    if ($cc === '' || $machineName === '' || $serviceName === '' || $servicedOn === '') {
        return json_encode(["status" => "failed", "error" => "Service name and date are required"]);
    }

    $stmt = $conn->prepare("SELECT `type` FROM `machine` WHERE `cc` = ? AND `machineName` = ?");
    $stmt->bind_param("ss", $cc, $machineName);
    $stmt->execute();
    $machine = $stmt->get_result()->fetch_assoc();
    if (!$machine) {
        return json_encode(["status" => "failed", "error" => "Unknown machine"]);
    }
    $type = $machine["type"];

    $stmt = $conn->prepare(
        "INSERT INTO `service` (`cc`, `servicedOn`, `serviceName`, `machineName`, `type`, `Amount`)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param("sssssd", $cc, $servicedOn, $serviceName, $machineName, $type, $amount);

    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed", "error" => "Could not save expense"]);
}

/**
 * Machine-wise expense totals for a date range, driving the report bar chart.
 * Machines without expenses in the range are left out.
 */
function getMachineExpenseReport() {
    $conn = getDbConnection();
    $obj = getPostData();
    $fromDate = $obj->fromDate ?? '';
    $toDate = $obj->toDate ?? '';
    $cc = trim($obj->cc ?? '');
    $type = trim($obj->type ?? '');

    if ($fromDate === '' || $toDate === '') {
        return json_encode([]);
    }

    $sql = "SELECT s.cc, s.machineName, s.type,
                   COUNT(*) AS expenseCount,
                   COALESCE(SUM(s.Amount), 0) AS totalAmount,
                   MIN(s.servicedOn) AS firstServicedOn,
                   MAX(s.servicedOn) AS lastServicedOn
            FROM `service` s
            WHERE s.servicedOn BETWEEN ? AND ?";
    $types = "ss";
    $params = [$fromDate, $toDate];

    if ($cc !== '') {
        $sql .= " AND s.cc = ?";
        $types .= "s";
        $params[] = $cc;
    }
    if ($type !== '') {
        $sql .= " AND s.type = ?";
        $types .= "s";
        $params[] = $type;
    }
    $sql .= " GROUP BY s.cc, s.machineName, s.type ORDER BY totalAmount DESC";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

?>
